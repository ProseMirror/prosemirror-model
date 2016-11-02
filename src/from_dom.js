const {Fragment} = require("./fragment")
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
//   ignore:: ?bool
//   When true, ignore content that matches this rule.
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
  // Parse a document from the content of a DOM node. To provide an
  // explicit parent document (for example, when not in a browser
  // window environment, where we simply use the global document),
  // pass it as the `document` property of `options`.
  parse(dom, options = {}) {
    let context = new ParseContext(this, options)
    context.addAll(dom, null, options.from, options.to)
    return context.finish()
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
    for (let name in schema.marks) {
      let rules = schema.marks[name].spec.parseDOM
      if (rules) rules.forEach(rule => {
        result.push(rule = copy(rule))
        rule.mark = name
      })
    }
    for (let name in schema.nodes) {
      let rules = schema.nodes[name].spec.parseDOM
      if (rules) rules.forEach(rule => {
        result.push(rule = copy(rule))
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

class NodeContext {
  constructor(type, attrs, solid, match, preserveWS) {
    this.type = type
    this.attrs = attrs
    this.solid = solid
    this.match = match || type.contentExpr.start(attrs)
    this.preserveWS = preserveWS
    this.content = []
  }

  finish(openRight) {
    if (!this.preserveWS) { // Strip trailing whitespace
      let last = this.content[this.content.length - 1], m
      if (last && last.isText && (m = /\s+$/.exec(last.text))) {
        if (last.text.length == m[0].length) this.content.pop()
        else this.content[this.content.length - 1] = last.withText(last.text.slice(0, last.text.length - m[0].length))
      }
    }
    let content = Fragment.from(this.content)
    if (!openRight) content = content.append(this.match.fillBefore(Fragment.empty, true))
    return this.type.create(this.match.attrs, content)
  }
}

class ParseContext {
  // : (DOMParser, Object)
  constructor(parser, options) {
    // : DOMParser The parser we are using.
    this.parser = parser
    // : Object The options passed to this parse.
    this.options = options
    let topNode = options.topNode
    this.nodes = [new NodeContext(topNode ? topNode.type : parser.schema.nodes.doc,
                                  topNode ? topNode.atts : null,
                                  true, null, options.preserveWhitespace)]
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
    } else if (dom.nodeType != 1 || dom.hasAttribute("pm-ignore")) {
      // Ignore
    } else if (dom.hasAttribute("pm-decoration")) {
      for (let child = dom.firstChild; child; child = child.nextSibling)
        this.addDOM(child)
    } else {
      let style = dom.getAttribute("style")
      if (style) this.addElementWithStyles(parseStyles(style), dom)
      else this.addElement(dom)
    }
  }

  addTextNode(dom) {
    let value = dom.nodeValue
    let top = this.top
    if (top.type.isTextblock || /\S/.test(value)) {
      if (!top.preserveWS) {
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

  // : (dom.Node)
  // Try to find a handler for the given tag and use that to parse. If
  // none is found, the element's content nodes are added directly.
  addElement(dom) {
    let name = dom.nodeName.toLowerCase()
    if (listTags.hasOwnProperty(name)) normalizeList(dom)
    // Ignore trailing BR nodes, which browsers create during editing
    if (this.options.editableContent && name == "br" && !dom.nextSibling) return
    if (!this.parseNodeType(dom, name)) {
      if (ignoreTags.hasOwnProperty(name)) {
        this.findInside(dom)
      } else {
        let sync = blockTags.hasOwnProperty(name) && this.top
        this.addAll(dom)
        if (sync) this.sync(sync)
      }
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

  // (dom.Node, string) → bool
  // Look up a handler for the given node. If none are found, return
  // false. Otherwise, apply it, use its return value to drive the way
  // the node's content is wrapped, and return true.
  parseNodeType(dom) {
    let rule = (this.options.ruleFromNode && this.options.ruleFromNode(dom)) || this.parser.matchTag(dom)
    if (!rule) return false
    if (rule.ignore) return true

    let sync, before, nodeType, markType
    if (rule.node) {
      nodeType = this.parser.schema.nodes[rule.node]
      if (nodeType.isLeaf) this.insertNode(nodeType.create(rule.attrs))
      else sync = this.enter(nodeType, rule.attrs, rule.preserveWhitespace) && this.top
    } else {
      markType = this.parser.schema.marks[rule.mark]
      before = this.addMark(markType.create(rule.attrs))
    }

    if (rule.mark || !nodeType.isLeaf) {
      let contentDOM = (rule.contentElement && dom.querySelector(rule.contentElement)) || dom
      this.findAround(dom, contentDOM, true)
      this.addAll(contentDOM, sync)
      if (sync) { this.sync(sync); this.open-- }
      else if (before) this.marks = before
      this.findAround(dom, contentDOM, true)
    } else {
      this.findInside(dom)
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
      let node = this.nodes[depth], found = node.match.findWrapping(type, attrs)
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
      let match = top.match.matchNode(node)
      if (!match) {
        node = node.mark(node.marks.filter(mark => top.match.allowsMark(mark.type)))
        match = top.match.matchNode(node)
      }
      top.match = match
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
    top.match = top.match.matchType(type, attrs)
    this.nodes.push(new NodeContext(type, attrs, solid, null,
                                    preserveWS == null ? top.preserveWS : preserveWS))
    this.open++
  }

  // Make sure all nodes above this.open are finished and added to
  // their parents
  closeExtra() {
    let i = this.nodes.length - 1
    if (i > this.open) {
      this.marks = Mark.none
      for (; i > this.open; i--) this.nodes[i - 1].content.push(this.nodes[i].finish())
      this.nodes.length = this.open + 1
    }
  }

  finish() {
    this.open = 0
    this.closeExtra()
    return this.nodes[0].finish()
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
