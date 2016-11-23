// DOMOutputSpec:: interface
// A description of a DOM structure. Can be either a string, which is
// interpreted as a text node, a DOM node, which is interpreted as
// itself, or an array.
//
// An array describes a DOM element. The first element in the array
// should be a string, and is the name of the DOM element. If the
// second element is a non-Array, non-DOM node object, it is
// interpreted as an object providing the DOM element's attributes.
// Any elements after that (including the 2nd if it's not an attribute
// object) are interpreted as children of the DOM elements, and must
// either be valid `DOMOutputSpec` values, or the number zero.
//
// The number zero (pronounced “hole”) is used to indicate the place
// where a ProseMirror node's content should be inserted.

// ::- A DOM serializer knows how to convert ProseMirror nodes and
// marks of various types to DOM nodes.
class DOMSerializer {
  // :: (Object<(node: Node) → DOMOutputSpec>, Object<(mark: Mark) → DOMOutputSpec>)
  // Create a serializer. `nodes` should map node names to functions
  // that take a node and return a description of the corresponding
  // DOM. `marks` does the same for mark names.
  constructor(nodes, marks) {
    // :: Object<(node: Node) → DOMOutputSpec>
    this.nodes = nodes || {}
    // :: Object<(mark: Mark) → DOMOutputSpec>
    this.marks = marks || {}
  }

  // :: (Fragment, ?Object) → dom.DocumentFragment
  // Serialize the content of this fragment to a DOM fragment. When
  // not in the browser, the `document` option, containing a DOM
  // document, should be passed so that the serialize can create
  // nodes.
  serializeFragment(fragment, options = {}, target) {
    if (!target) target = doc(options).createDocumentFragment()

    let top = target, active = null
    fragment.forEach(node => {
      if (active || node.marks.length) {
        if (!active) active = []
        let keep = 0
        for (; keep < Math.min(active.length, node.marks.length); ++keep)
          if (!node.marks[keep].eq(active[keep])) break
        while (keep < active.length) {
          active.pop()
          top = top.parentNode
        }
        while (active.length < node.marks.length) {
          let add = node.marks[active.length]
          active.push(add)
          top = top.appendChild(this.serializeMark(add, options))
        }
      }
      top.appendChild(this.serializeNode(node, options))
    })

    return target
  }

  // :: (Node, ?Object) → dom.Node
  // Serialize this node to a DOM node. This can be useful when you
  // need to serialize a part of a document, as opposed to the whole
  // document. To serialize a whole document, use
  // [`serializeFragment`](#model.DOMSerializer.serializeFragment) on
  // its [`content`](#model.Node.content).
  serializeNode(node, options = {}) {
    return this.renderStructure(this.nodes[node.type.name](node), node, options)
  }

  serializeNodeAndMarks(node, options = {}) {
    let dom = this.serializeNode(node, options)
    for (let i = node.marks.length - 1; i >= 0; i--) {
      let wrap = this.serializeMark(node.marks[i], options)
      wrap.appendChild(dom)
      dom = wrap
    }
    return dom
  }

  serializeMark(mark, options = {}) {
    return this.renderStructure(this.marks[mark.type.name](mark), null, options)
  }

  // :: (dom.Document, DOMOutputSpec) → {dom: dom.Node, contentDOM: ?dom.Node}
  // Render an [output spec](##model.DOMOutputSpec).
  static renderSpec(doc, structure) {
    if (typeof structure == "string")
      return {dom: doc.createTextNode(structure)}
    if (structure.nodeType != null)
      return {dom: structure}
    let dom = doc.createElement(structure[0]), contentDOM = null
    let attrs = structure[1], start = 1
    if (attrs && typeof attrs == "object" && attrs.nodeType == null && !Array.isArray(attrs)) {
      start = 2
      for (let name in attrs) {
        if (name == "style") dom.style.cssText = attrs[name]
        else if (attrs[name] != null) dom.setAttribute(name, attrs[name])
      }
    }
    for (let i = start; i < structure.length; i++) {
      let child = structure[i]
      if (child === 0) {
        if (i < structure.length - 1 || i > start)
          throw new RangeError("Content hole must be the only child of its parent node")
        return {dom, contentDOM: dom}
      } else {
        let {dom: inner, contentDOM: innerContent} = DOMSerializer.renderSpec(doc, child)
        dom.appendChild(inner)
        if (innerContent) {
          if (contentDOM) throw new RangeError("Multiple content holes")
          contentDOM = innerContent
        }
      }
    }
    return {dom, contentDOM}
  }

  renderStructure(structure, node, options) {
    let {dom, contentDOM} = DOMSerializer.renderSpec(doc(options), structure)
    if (node && !node.isLeaf) {
      if (!contentDOM) throw new RangeError("No content hole in template for non-leaf node")
      if (options.onContent)
        options.onContent(node, contentDOM, options)
      else
        this.serializeFragment(node.content, options, contentDOM)
    } else if (contentDOM) {
      throw new RangeError("Content hole not allowed in a mark or leaf node spec")
    }
    return dom
  }

  // :: (Schema) → DOMSerializer
  // Build a serializer using the [`toDOM`](#model.NodeSpec.toDOM)
  // properties in a schema's node and mark specs.
  static fromSchema(schema) {
    return schema.cached.domSerializer ||
      (schema.cached.domSerializer = new DOMSerializer(this.nodesFromSchema(schema), this.marksFromSchema(schema)))
  }

  // :: (Schema) → Object<(node: Node) → DOMOutputSpec>
  // Gather the serializers in a schema's node specs into an object.
  // This can be useful as a base to build a custom serializer from.
  static nodesFromSchema(schema) {
    return gatherToDOM(schema.nodes)
  }

  // :: (Schema) → Object<(mark: Mark) → DOMOutputSpec>
  // Gather the serializers in a schema's mark specs into an object.
  static marksFromSchema(schema) {
    return gatherToDOM(schema.marks)
  }
}
exports.DOMSerializer = DOMSerializer

function gatherToDOM(obj) {
  let result = {}
  for (let name in obj) {
    let toDOM = obj[name].spec.toDOM
    if (toDOM) result[name] = toDOM
  }
  return result
}

function doc(options) {
  // declare global: window
  return options.document || window.document
}
