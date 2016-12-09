const {Fragment} = require("./fragment")
const {Slice} = require("./replace")
const {Mark} = require("./mark")

// ParseRule:: interface
// A value that describes how to parse a given DOM node or inline
// style as a ProseMirror node or mark.
//
//   tag:: ?string
//   A CSS selector describing the kind of DOM elements to match. A
//   single rule should have _either_ a `tag` or a `style` property.
//
//   style:: ?string
//   A CSS property name to match. When given, this rule matches
//   inline styles that list that property.
//
//   node:: ?string
//   The name of the node type to create when this rule matches. Only
//   valid for rules with a `tag` property, not for style rules. Each
//   rule should have one of a `node`, `mark`, or `ignore` property
//   (except when it appears in a [node](#model.NodeSpec.parseDOM) or
//   [mark spec](#model.MarkSpec.parseDOM), in which case the `node`
//   or `mark` property will be derived from its position).
//
//   mark:: ?string
//   The name of the mark type to wrap the matched content in.
//
//   priority:: ?number
//   Can be used to change the order in which the parse rules in a
//   schema are tried. Those with higher priority come first. Rules
//   without a priority are counted as having priority 50. This
//   property is only meaningful in a schema—when directly
//   constructing a parser, the order of the rule array is used.
//
//   ignore:: ?bool
//   When true, ignore content that matches this rule.
//
//   skip:: ?bool
//   When true, ignore the node that matches this rule, but do parse
//   its content.
//
//   attrs:: ?Object
//   Attributes for the node or mark created by this rule. When
//   `getAttrs` is provided, it takes precedence.
//
//   getAttrs:: ?(union<dom.Node, string>) → ?union<bool, Object>
//   A function used to compute the attributes for the node or mark
//   created by this rule. Can also be used to describe further
//   conditions the DOM element or style must match. When it returns
//   `false`, the rule won't match. When it returns null or undefined,
//   that is interpreted as an empty/default set of attributes.
//
//   Called with a DOM Element for `tag` rules, and with a string (the
//   style's value) for `style` rules.
//
//   contentElement:: ?string
//   For `tag` rules that produce non-leaf nodes or marks, by default
//   the content of the DOM element is parsed as content of the mark
//   or node. If the child nodes are in a descendent node, this may be
//   a CSS selector string that the parser must use to find the actual
//   content element.
//
//   getContent:: ?(dom.Node) → Fragment
//   Can be used to override the content of a matched node. Will be
//   called, and its result used, instead of parsing the node's child
//   node.
//
//   preserveWhitespace:: ?bool
//   Controls whether whitespace should be preserved when parsing the
//   content inside the matched element.

// ::- A DOM parser represents a strategy for parsing DOM content into
// a ProseMirror document conforming to a given schema. Its behavior
// is defined by an array of [rules](#model.ParseRule).
class DOMParser {
  // :: (Schema, [ParseRule])
  // Create a parser that targets the given schema, using the given
  // parsing rules.
  constructor(schema, rules) {
    // :: Schema
    this.schema = schema
    // :: [ParseRule]
    this.rules = rules
    this.tags = []
    this.styles = []

    rules.forEach(rule => {
      if (rule.tag) this.tags.push(rule)
      else if (rule.style) this.styles.push(rule)
    })
  }

  // :: (dom.Node, ?Object) → Node
  // Parse a document from the content of a DOM node.
  //
  //   options::- Configuration options.
  //
  //     preserveWhitespace:: ?bool
  //     By default, whitespace is collapsed as per HTML's rules. Pass
  //     true here to prevent the parser from doing that.
  //
  //     findPositions:: ?[{node: dom.Node, offset: number}]
  //     When given, the parser will, beside parsing the content,
  //     record the document positions of the given DOM positions. It
  //     will do so by writing to the objects, adding a `pos` property
  //     that holds the document position. DOM positions that are not
  //     in the parsed content will not be written to.
  //
  //     from:: ?number
  //     The child node index to start parsing from.
  //
  //     to:: ?number
  //     The child node index to stop parsing at.
  //
  //     topNode:: ?Node
  //     By default, the content is parsed into a `doc` node. You can
  //     pass this option to use the type and attributes from a
  //     different node as the top container.
  //
  //     topStart:: ?number
  //     Can be used to influence the content match at the start of
  //     the topnode. When given, should be a valid index into
  //     `topNode`.
  parse(dom, options = {}) {
    let context = new ParseContext(this, options, false)
    context.addAll(dom, null, options.from, options.to)
    return context.finish()
  }

  // :: (dom.Node, ?Object) → Slice
  // Parses the content of the given DOM node, like
  // [`parse`](#model.DOMParser.parse), and takes the same set of
  // options. But unlike that method, which produces a whole node,
  // this one returns a slice that is open at the sides, meaning that
  // the schema constraints aren't applied to the start of nodes to
  // the left of the input and the end of nodes at the end.
  parseSlice(dom, options = {}) {
    let context = new ParseContext(this, options, true)
    context.addAll(dom, null, options.from, options.to)
    return Slice.maxOpen(context.finish())
  }

  matchTag(dom) {
    for (let i = 0; i < this.tags.length; i++) {
      let rule = this.tags[i]
      if (matches(dom, rule.tag)) {
        if (rule.getAttrs) {
          let result = rule.getAttrs(dom)
          if (result === false) continue
          rule.attrs = result
        }
        return rule
      }
    }
  }

  matchStyle(prop, value) {
    for (let i = 0; i < this.styles.length; i++) {
      let rule = this.styles[i]
      if (rule.style == prop) {
        if (rule.getAttrs) {
          let result = rule.getAttrs(value)
          if (result === false) continue
          rule.attrs = result
        }
        return rule
      }
    }
  }

  // :: (Schema) → [ParseRule]
  // Extract the parse rules listed in a schema's [node
  // specs](#model.NodeSpec.parseDOM).
  static schemaRules(schema) {
    let result = []
    function insert(rule) {
      let priority = rule.priority == null ? 50 : rule.priority, i = 0
      for (; i < result.length; i++) {
        let next = result[i], nextPriority = next.priority == null ? 50 : next.priority
        if (nextPriority < priority) break
      }
      result.splice(i, 0, rule)
    }

    for (let name in schema.marks) {
      let rules = schema.marks[name].spec.parseDOM
      if (rules) rules.forEach(rule => {
        insert(rule = copy(rule))
        rule.mark = name
      })
    }
    for (let name in schema.nodes) {
      let rules = schema.nodes[name].spec.parseDOM
      if (rules) rules.forEach(rule => {
        insert(rule = copy(rule))
        rule.node = name
      })
    }
    return result
  }

  // :: (Schema) → DOMParser
  // Construct a DOM parser using the parsing rules listed in a
  // schema's [node specs](#model.NodeSpec.parseDOM).
  static fromSchema(schema) {
    return schema.cached.domParser ||
      (schema.cached.domParser = new DOMParser(schema, DOMParser.schemaRules(schema)))
  }
}
exports.DOMParser = DOMParser

// : Object<bool> The block-level tags in HTML5
const blockTags = {
  address: true, article: true, aside: true, blockquote: true, canvas: true,
  dd: true, div: true, dl: true, fieldset: true, figcaption: true, figure: true,
  footer: true, form: true, h1: true, h2: true, h3: true, h4: true, h5: true,
  h6: true, header: true, hgroup: true, hr: true, li: true, noscript: true, ol: true,
  output: true, p: true, pre: true, section: true, table: true, tfoot: true, ul: true
}

// : Object<bool> The tags that we normally ignore.
const ignoreTags = {
  head: true, noscript: true, object: true, script: true, style: true, title: true
}

// : Object<bool> List tags.
const listTags = {ol: true, ul: true}

// Using a bitfield for node context options
const OPT_PRESERVE_WS = 1, OPT_OPEN_LEFT = 2

class NodeContext {
  constructor(type, attrs, solid, match, options) {
    this.type = type
    this.attrs = attrs
    this.solid = solid
    this.match = match || (options & OPT_OPEN_LEFT ? null : type.contentExpr.start(attrs))
    this.options = options
    this.content = []
  }

  findWrapping(type, attrs) {
    if (!this.match) {
      if (!this.type) return []
      let found = this.type.contentExpr.atType(this.attrs, type, attrs)
      if (!found) {
        let start = this.type.contentExpr.start(this.attrs), wrap
        if (wrap = start.findWrapping(type, attrs)) {
          this.match = start
          return wrap
        }
      }
      if (found) this.match = found
      else return null
    }
    return this.match.findWrapping(type, attrs)
  }

  finish(openRight) {
    if (!(this.options & OPT_PRESERVE_WS)) { // Strip trailing whitespace
      let last = this.content[this.content.length - 1], m
      if (last && last.isText && (m = /\s+$/.exec(last.text))) {
        if (last.text.length == m[0].length) this.content.pop()
        else this.content[this.content.length - 1] = last.withText(last.text.slice(0, last.text.length - m[0].length))
      }
    }
    let content = Fragment.from(this.content)
    if (!openRight && this.match)
      content = content.append(this.match.fillBefore(Fragment.empty, true))
    return this.type ? this.type.create(this.attrs, content) : content
  }
}

class ParseContext {
  // : (DOMParser, Object)
  constructor(parser, options, open) {
    // : DOMParser The parser we are using.
    this.parser = parser
    // : Object The options passed to this parse.
    this.options = options
    this.isOpen = open
    let topNode = options.topNode, topContext
    let topOptions = (options.preserveWhitespace ? OPT_PRESERVE_WS : 0) | (open ? OPT_OPEN_LEFT : 0)
    if (topNode)
      topContext = new NodeContext(topNode.type, topNode.attrs, true,
                                   topNode.contentMatchAt(options.topStart || 0), topOptions)
    else if (open)
      topContext = new NodeContext(null, null, true, null, topOptions)
    else
      topContext = new NodeContext(parser.schema.nodes.doc, null, true, null, topOptions)
    this.nodes = [topContext]
    // : [Mark] The current set of marks
    this.marks = Mark.none
    this.open = 0
    this.find = options.findPositions
  }

  get top() {
    return this.nodes[this.open]
  }

  // : (Mark) → [Mark]
  // Add a mark to the current set of marks, return the old set.
  addMark(mark) {
    let old = this.marks
    this.marks = mark.addToSet(this.marks)
    return old
  }

  // : (dom.Node)
  // Add a DOM node to the content. Text is inserted as text node,
  // otherwise, the node is passed to `addElement` or, if it has a
  // `style` attribute, `addElementWithStyles`.
  addDOM(dom) {
    if (dom.nodeType == 3) {
      this.addTextNode(dom)
    } else if (dom.nodeType == 1) {
      let style = dom.getAttribute("style")
      if (style) this.addElementWithStyles(parseStyles(style), dom)
      else this.addElement(dom)
    }
  }

  addTextNode(dom) {
    let value = dom.nodeValue
    let top = this.top
    if ((top.type && top.type.isTextblock) || /\S/.test(value)) {
      if (!(top.options & OPT_PRESERVE_WS)) {
        value = value.replace(/\s+/g, " ")
        // If this starts with whitespace, and there is either no node
        // before it or a node that ends with whitespace, strip the
        // leading space.
        if (/^\s/.test(value)) {
          let nodeBefore = top.content[top.content.length - 1]
          if (!nodeBefore || nodeBefore.isText && /\s$/.test(nodeBefore.text))
            value = value.slice(1)
        }
      }
      if (value) this.insertNode(this.parser.schema.text(value, this.marks))
      this.findInText(dom)
    } else {
      this.findInside(dom)
    }
  }

  // : (dom.Element)
  // Try to find a handler for the given tag and use that to parse. If
  // none is found, the element's content nodes are added directly.
  addElement(dom) {
    let name = dom.nodeName.toLowerCase()
    if (listTags.hasOwnProperty(name)) normalizeList(dom)
    let rule = (this.options.ruleFromNode && this.options.ruleFromNode(dom)) || this.parser.matchTag(dom)
    if (rule ? rule.ignore : ignoreTags.hasOwnProperty(name)) {
      this.findInside(dom)
    } else if (!rule || rule.skip) {
      if (rule && rule.skip.nodeType) dom = rule.skip
      let sync = blockTags.hasOwnProperty(name) && this.top
      this.addAll(dom)
      if (sync) this.sync(sync)
    } else {
      this.addElementByRule(dom, rule)
    }
  }

  // Run any style parser associated with the node's styles. After
  // that, if no style parser suppressed the node's content, pass it
  // through to `addElement`.
  addElementWithStyles(styles, dom) {
    let oldMarks = this.marks, ignore = false
    for (let i = 0; i < styles.length; i += 2) {
      let rule = this.parser.matchStyle(styles[i], styles[i + 1])
      if (!rule) continue
      if (rule.ignore) { ignore = true; break }
      this.addMark(this.parser.schema.marks[rule.mark].create(rule.attrs))
    }
    if (!ignore) this.addElement(dom)
    this.marks = oldMarks
  }

  // : (dom.Element, ParseRule) → bool
  // Look up a handler for the given node. If none are found, return
  // false. Otherwise, apply it, use its return value to drive the way
  // the node's content is wrapped, and return true.
  addElementByRule(dom, rule) {
    let sync, before, nodeType, markType, mark
    if (rule.node) {
      nodeType = this.parser.schema.nodes[rule.node]
      if (nodeType.isLeaf) this.insertNode(nodeType.create(rule.attrs, null, this.marks))
      else sync = this.enter(nodeType, rule.attrs, rule.preserveWhitespace) && this.top
    } else {
      markType = this.parser.schema.marks[rule.mark]
      before = this.addMark(mark = markType.create(rule.attrs))
    }

    if (nodeType && nodeType.isLeaf) {
      this.findInside(dom)
    } else if (rule.getContent) {
      this.findInside(dom)
      rule.getContent(dom).forEach(node => this.insertNode(mark ? node.mark(mark.addToSet(node.marks)) : node))
    } else {
      let contentDOM = rule.contentElement
      if (typeof contentDOM == "string") contentDOM = dom.querySelector(contentDOM)
      if (!contentDOM) contentDOM = dom
      this.findAround(dom, contentDOM, true)
      this.addAll(contentDOM, sync)
      if (sync) { this.sync(sync); this.open-- }
      else if (before) this.marks = before
      this.findAround(dom, contentDOM, true)
    }
    return true
  }

  // : (dom.Node, ?NodeBuilder, ?number, ?number)
  // Add all child nodes between `startIndex` and `endIndex` (or the
  // whole node, if not given). If `sync` is passed, use it to
  // synchronize after every block element.
  addAll(parent, sync, startIndex, endIndex) {
    let index = startIndex || 0
    for (let dom = startIndex ? parent.childNodes[startIndex] : parent.firstChild,
             end = endIndex == null ? null : parent.childNodes[endIndex];
         dom != end; dom = dom.nextSibling, ++index) {
      this.findAtPoint(parent, index)
      this.addDOM(dom)
      if (sync && blockTags.hasOwnProperty(dom.nodeName.toLowerCase()))
        this.sync(sync)
    }
    this.findAtPoint(parent, index)
  }

  // Try to find a way to fit the given node type into the current
  // context. May add intermediate wrappers and/or leave non-solid
  // nodes that we're in.
  findPlace(type, attrs) {
    let route, sync
    for (let depth = this.open; depth >= 0; depth--) {
      let node = this.nodes[depth]
      let found = node.findWrapping(type, attrs)
      if (found && (!route || route.length > found.length)) {
        route = found
        sync = node
        if (!found.length) break
      }
      if (node.solid) break
    }
    if (!route) return false
    this.sync(sync)
    for (let i = 0; i < route.length; i++)
      this.enterInner(route[i].type, route[i].attrs, false)
    return true
  }

  // : (Node) → ?Node
  // Try to insert the given node, adjusting the context when needed.
  insertNode(node) {
    if (this.findPlace(node.type, node.attrs)) {
      this.closeExtra()
      let top = this.top
      if (top.match) {
        let match = top.match.matchNode(node)
        if (!match) {
          node = node.mark(node.marks.filter(mark => top.match.allowsMark(mark.type)))
          match = top.match.matchNode(node)
        }
        top.match = match
      }
      top.content.push(node)
    }
  }

  // : (NodeType, ?Object) → bool
  // Try to start a node of the given type, adjusting the context when
  // necessary.
  enter(type, attrs, preserveWS) {
    let ok = this.findPlace(type, attrs)
    if (ok) this.enterInner(type, attrs, true, preserveWS)
    return ok
  }

  // Open a node of the given type
  enterInner(type, attrs, solid, preserveWS) {
    this.closeExtra()
    let top = this.top
    top.match = top.match && top.match.matchType(type, attrs)
    let options = preserveWS == null ? top.options & OPT_PRESERVE_WS : preserveWS ? OPT_PRESERVE_WS : 0
    if ((top.options & OPT_OPEN_LEFT) && top.content.length == 0) options |= OPT_OPEN_LEFT
    this.nodes.push(new NodeContext(type, attrs, solid, null, options))
    this.open++
  }

  // Make sure all nodes above this.open are finished and added to
  // their parents
  closeExtra(openRight) {
    let i = this.nodes.length - 1
    if (i > this.open) {
      this.marks = Mark.none
      for (; i > this.open; i--) this.nodes[i - 1].content.push(this.nodes[i].finish(openRight))
      this.nodes.length = this.open + 1
    }
  }

  finish() {
    this.open = 0
    this.closeExtra(this.isOpen)
    return this.nodes[0].finish(this.isOpen || this.options.topOpen)
  }

  sync(to) {
    for (let i = this.open; i >= 0; i--) if (this.nodes[i] == to) {
      this.open = i
      return
    }
  }

  get currentPos() {
    this.closeExtra()
    let pos = 0
    for (let i = this.open; i >= 0; i--) {
      let content = this.nodes[i].content
      for (let j = content.length - 1; j >= 0; j--)
        pos += content[j].nodeSize
      if (i) pos++
    }
    return pos
  }

  findAtPoint(parent, offset) {
    if (this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].node == parent && this.find[i].offset == offset)
        this.find[i].pos = this.currentPos
    }
  }

  findInside(parent) {
    if (this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].pos == null && parent.contains(this.find[i].node))
        this.find[i].pos = this.currentPos
    }
  }

  findAround(parent, content, before) {
    if (parent != content && this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].pos == null && parent.contains(this.find[i].node)) {
        let pos = content.compareDocumentPosition(this.find[i].node)
        if (pos & (before ? 2 : 4))
          this.find[i].pos = this.currentPos
      }
    }
  }

  findInText(textNode) {
    if (this.find) for (let i = 0; i < this.find.length; i++) {
      if (this.find[i].node == textNode)
        this.find[i].pos = this.currentPos - (textNode.nodeValue.length - this.find[i].offset)
    }
  }
}

// Kludge to work around directly nested list nodes produced by some
// tools and allowed by browsers to mean that the nested list is
// actually part of the list item above it.
function normalizeList(dom) {
  for (let child = dom.firstChild, prevItem = null; child; child = child.nextSibling) {
    let name = child.nodeType == 1 ? child.nodeName.toLowerCase() : null
    if (name && listTags.hasOwnProperty(name) && prevItem) {
      prevItem.appendChild(child)
      child = prevItem
    } else if (name == "li") {
      prevItem = child
    } else if (name) {
      prevItem = null
    }
  }
}

// Apply a CSS selector.
function matches(dom, selector) {
  return (dom.matches || dom.msMatchesSelector || dom.webkitMatchesSelector || dom.mozMatchesSelector).call(dom, selector)
}

// : (string) → [string]
// Tokenize a style attribute into property/value pairs.
function parseStyles(style) {
  let re = /\s*([\w-]+)\s*:\s*([^;]+)/g, m, result = []
  while (m = re.exec(style)) result.push(m[1], m[2].trim())
  return result
}

function copy(obj) {
  let copy = {}
  for (let prop in obj) copy[prop] = obj[prop]
  return copy
}
