const OrderedMap = require("orderedmap")

const {Node, TextNode} = require("./node")
const {Fragment} = require("./fragment")
const {Mark} = require("./mark")
const {ContentExpr} = require("./content")

// For node types where all attrs have a default value (or which don't
// have any attributes), build up a single reusable default attribute
// object, and use it for all nodes that don't specify specific
// attributes.
function defaultAttrs(attrs) {
  let defaults = Object.create(null)
  for (let attrName in attrs) {
    let attr = attrs[attrName]
    if (attr.default === undefined) return null
    defaults[attrName] = attr.default
  }
  return defaults
}

function computeAttrs(attrs, value) {
  let built = Object.create(null)
  for (let name in attrs) {
    let given = value && value[name]
    if (given == null) {
      let attr = attrs[name]
      if (attr.default !== undefined)
        given = attr.default
      else if (attr.compute)
        given = attr.compute()
      else
        throw new RangeError("No value supplied for attribute " + name)
    }
    built[name] = given
  }
  return built
}

function initAttrs(attrs) {
  let result = Object.create(null)
  if (attrs) for (let name in attrs) result[name] = new Attribute(attrs[name])
  return result
}

// ::- Node types are objects allocated once per `Schema` and used to
// tag `Node` instances with a type. They contain information about
// the node type, such as its name and what kind of node it
// represents.
class NodeType {
  constructor(name, schema, spec) {
    // :: string
    // The name the node type has in this schema.
    this.name = name

    // :: Schema
    // A link back to the `Schema` the node type belongs to.
    this.schema = schema

    // :: NodeSpec
    // The spec that this type is based on
    this.spec = spec

    this.groups = spec.group ? spec.group.split(" ") : []
    this.attrs = initAttrs(spec.attrs)

    this.defaultAttrs = defaultAttrs(this.attrs)
    this.contentExpr = null

    // :: bool
    // True if this is a block type
    this.isBlock = !(spec.inline || name == "text")

    // :: bool
    // True if this is the text node type.
    this.isText = name == "text"
  }

  // :: bool
  // True if this is an inline type.
  get isInline() { return !this.isBlock }

  // :: bool
  // True if this is a textblock type, a block that contains inline
  // content.
  get isTextblock() { return this.isBlock && this.contentExpr.inlineContent }

  // :: bool
  // True if this node type has inline content.
  get inlineContent() { return this.contentExpr.inlineContent }

  // :: bool
  // True for node types that allow no content.
  get isLeaf() { return this.contentExpr.isLeaf }

  // :: bool
  // True when this node is an atom, i.e. when it does not have
  // directly editable content.
  get isAtom() { return this.isLeaf || this.spec.atom }

  hasRequiredAttrs(ignore) {
    for (let n in this.attrs)
      if (this.attrs[n].isRequired && (!ignore || !(n in ignore))) return true
    return false
  }

  compatibleContent(other) {
    return this == other || this.contentExpr.compatible(other.contentExpr)
  }

  computeAttrs(attrs) {
    if (!attrs && this.defaultAttrs) return this.defaultAttrs
    else return computeAttrs(this.attrs, attrs)
  }

  // :: (?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → Node
  // Create a `Node` of this type. The given attributes are
  // checked and defaulted (you can pass `null` to use the type's
  // defaults entirely, if no required attributes exist). `content`
  // may be a `Fragment`, a node, an array of nodes, or
  // `null`. Similarly `marks` may be `null` to default to the empty
  // set of marks.
  create(attrs, content, marks) {
    if (typeof content == "string") throw new Error("Calling create with string")
    if (this.isText) throw new Error("NodeType.create can't construct text nodes")
    return new Node(this, this.computeAttrs(attrs), Fragment.from(content), Mark.setFrom(marks))
  }

  // :: (?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → Node
  // Like [`create`](#model.NodeType.create), but check the given content
  // against the node type's content restrictions, and throw an error
  // if it doesn't match.
  createChecked(attrs, content, marks) {
    attrs = this.computeAttrs(attrs)
    content = Fragment.from(content)
    if (!this.validContent(content, attrs))
      throw new RangeError("Invalid content for node " + this.name)
    return new Node(this, attrs, content, Mark.setFrom(marks))
  }

  // :: (?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → ?Node
  // Like [`create`](#model.NodeType.create), but see if it is necessary to
  // add nodes to the start or end of the given fragment to make it
  // fit the node. If no fitting wrapping can be found, return null.
  // Note that, due to the fact that required nodes can always be
  // created, this will always succeed if you pass null or
  // `Fragment.empty` as content.
  createAndFill(attrs, content, marks) {
    attrs = this.computeAttrs(attrs)
    content = Fragment.from(content)
    if (content.size) {
      let before = this.contentExpr.start(attrs).fillBefore(content)
      if (!before) return null
      content = before.append(content)
    }
    let after = this.contentExpr.getMatchAt(attrs, content).fillBefore(Fragment.empty, true)
    if (!after) return null
    return new Node(this, attrs, content.append(after), Mark.setFrom(marks))
  }

  // :: (Fragment, ?Object) → bool
  // Returns true if the given fragment is valid content for this node
  // type with the given attributes.
  validContent(content, attrs) {
    return this.contentExpr.matches(attrs, content)
  }

  static compile(nodes, schema) {
    let result = Object.create(null)
    nodes.forEach((name, spec) => result[name] = new NodeType(name, schema, spec))

    let topType = schema.spec.topNode || "doc"
    if (!result[topType]) throw new RangeError("Schema is missing its top node type ('" + topType + "')")
    if (!result.text) throw new RangeError("Every schema needs a 'text' type")
    for (let _ in result.text.attrs) throw new RangeError("The text node type should not have attributes")

    return result
  }
}
exports.NodeType = NodeType

// Attribute descriptors

class Attribute {
  constructor(options) {
    this.default = options.default
    this.compute = options.compute
  }

  get isRequired() {
    return this.default === undefined && !this.compute
  }
}

// Marks

// ::- Like nodes, marks (which are associated with nodes to signify
// things like emphasis or being part of a link) are tagged with type
// objects, which are instantiated once per `Schema`.
class MarkType {
  constructor(name, rank, schema, spec) {
    // :: string
    // The name of the mark type.
    this.name = name

    // :: Schema
    // The schema that this mark type instance is part of.
    this.schema = schema

    // :: MarkSpec
    // The spec on which the type is based.
    this.spec = spec

    this.attrs = initAttrs(spec.attrs)

    this.rank = rank
    this.excluded = null
    let defaults = defaultAttrs(this.attrs)
    this.instance = defaults && new Mark(this, defaults)
  }

  // :: (?Object) → Mark
  // Create a mark of this type. `attrs` may be `null` or an object
  // containing only some of the mark's attributes. The others, if
  // they have defaults, will be added.
  create(attrs) {
    if (!attrs && this.instance) return this.instance
    return new Mark(this, computeAttrs(this.attrs, attrs))
  }

  static compile(marks, schema) {
    let result = Object.create(null), rank = 0
    marks.forEach((name, spec) => result[name] = new MarkType(name, rank++, schema, spec))
    return result
  }

  // :: ([Mark]) → [Mark]
  // When there is a mark of this type in the given set, a new set
  // without it is returned. Otherwise, the input set is returned.
  removeFromSet(set) {
    for (var i = 0; i < set.length; i++)
      if (set[i].type == this)
        return set.slice(0, i).concat(set.slice(i + 1))
    return set
  }

  // :: ([Mark]) → ?Mark
  // Tests whether there is a mark of this type in the given set.
  isInSet(set) {
    for (let i = 0; i < set.length; i++)
      if (set[i].type == this) return set[i]
  }

  // :: (MarkType) → bool
  excludes(other) {
    return this.excluded.indexOf(other) > -1
  }
}
exports.MarkType = MarkType

// SchemaSpec:: interface
// An object describing a schema, as passed to the `Schema`
// constructor.
//
//   nodes:: union<Object<NodeSpec>, OrderedMap<NodeSpec>>
//   The node types in this schema. Maps names to `NodeSpec` objects
//   describing the node to be associated with that name. Their order
//   is significant
//
//   marks:: ?union<Object<MarkSpec>, OrderedMap<MarkSpec>>
//   The mark types that exist in this schema.
//
//   topNode:: ?string
//   The name of the default top-level node for the schema. Defaults
//   to `"doc"`.

// NodeSpec:: interface
//
//   content:: ?string
//   The content expression for this node, as described in the [schema
//   guide](/docs/guides/schema/). When not given, the node does not allow
//   any content.
//
//   group:: ?string
//   The group or space-separated groups to which this node belongs, as
//   referred to in the content expressions for the schema.
//
//   inline:: ?bool
//   Should be set to a truthy value for inline nodes. (Implied for
//   text nodes.)
//
//   atom:: ?bool
//   Can be set to true to indicate that, though this isn't a [leaf
//   node](#model.NodeType.isLeaf), it doesn't have directly editable
//   content and should be treated as a single unit in the view.
//
//   attrs:: ?Object<AttributeSpec>
//   The attributes that nodes of this type get.
//
//   selectable:: ?bool
//   Controls whether nodes of this type can be selected (as a [node
//   selection](#state.NodeSelection)). Defaults to true for non-text
//   nodes.
//
//   draggable:: ?bool
//   Determines whether nodes of this type can be dragged without
//   being selected. Defaults to false.
//
//   code:: ?bool
//   Can be used to indicate that this node contains code, which
//   causes some commands to behave differently.
//
//   defining:: ?bool
//   Determines whether this node is considered an important parent
//   node during replace operations (such as paste). Non-defining (the
//   default) nodes get dropped when their entire content is replaced,
//   whereas defining nodes persist and wrap the inserted content.
//   Likewise, the the _inserted_ content, when not inserting into a
//   textblock, the defining parents of the content are preserved.
//   Typically, non-default-paragraph textblock types, and possible
//   list items, are marked as defining.
//
//   isolating:: ?bool
//   When enabled (default is false), the sides of nodes of this type
//   count as boundaries that regular editing operations, like
//   backspacing or lifting, won't cross. An example of a node that
//   should probably have this set is a table cell.
//
//   toDOM:: ?(node: Node) → DOMOutputSpec
//   Defines the default way a node of this type should be serialized
//   to DOM/HTML (as used by
//   [`DOMSerializer.fromSchema`](#model.DOMSerializer^fromSchema)).
//   Should return an [array structure](#model.DOMOutputSpec) that
//   describes the resulting DOM structure, with an optional number
//   zero (“hole”) in it to indicate where the node's content should
//   be inserted.
//
//   For text nodes, the default is to create a text DOM node. Though
//   it is possible to create a serializer where text is rendered
//   differently, this is not supported inside the editor, so you
//   shouldn't override that in your text node spec.
//
//   parseDOM:: ?[ParseRule]
//   Associates DOM parser information with this node, which can be
//   used by [`DOMParser.fromSchema`](#model.DOMParser^fromSchema) to
//   automatically derive a parser. The `node` field in the rules is
//   implied (the name of this node will be filled in automatically).
//   If you supply your own parser, you do not need to also specify
//   parsing rules in your schema.

// MarkSpec:: interface
//
//   attrs:: ?Object<AttributeSpec>
//   The attributes that marks of this type get.
//
//   inclusive:: ?bool
//   Whether this mark should be active when the cursor is positioned
//   at the start or end boundary of the mark. Defaults to true.
//
//   excludes:: ?string
//   Determines which other marks this mark can coexist with. Should
//   be a space-separated strings naming other marks or groups of marks.
//   When a mark is [added](#model.mark.addToSet) to a set, all marks
//   that it excludes are removed in the process. If the set contains
//   any mark that excludes the new mark but is not, itself, excluded
//   by the new mark, the mark can not be added an the set. You can
//   use the value `"_"` to indicate that the mark excludes all
//   marks in the schema.
//
//   Defaults to only being exclusive with marks of the same type. You
//   can set it to an empty string (or any string not containing the
//   mark's own name) to allow multiple marks of a given type to
//   coexist (as long as they have different attributes).
//
//   group:: ?string
//   The group or space-separated groups to which this node belongs.
//
//   toDOM:: ?(mark: Mark, inline: bool) → DOMOutputSpec
//   Defines the default way marks of this type should be serialized
//   to DOM/HTML.
//
//   parseDOM:: ?[ParseRule]
//   Associates DOM parser information with this mark (see the
//   corresponding [node spec field](#model.NodeSpec.parseDOM)). The
//   `mark` field in the rules is implied.

// AttributeSpec:: interface
//
// Used to define attributes. Attributes that have no default or
// compute property must be provided whenever a node or mark of a type
// that has them is created.
//
// The following fields are supported:
//
//   default:: ?any
//   The default value for this attribute, to choose when no
//   explicit value is provided.
//
//   compute:: ?() → any
//   A function that computes a default value for the attribute.

// ::- A document schema.
class Schema {
  // :: (SchemaSpec)
  // Construct a schema from a specification.
  constructor(spec) {
    // :: SchemaSpec
    // The [spec](#model.SchemaSpec) on which the schema is based,
    // with the added guarantee that its `nodes` and `marks`
    // properties are
    // [`OrderedMap`](https://github.com/marijnh/orderedmap) instances
    // (not raw objects or null).
    this.spec = {}
    for (let prop in spec) this.spec[prop] = spec[prop]
    this.spec.nodes = OrderedMap.from(spec.nodes)
    this.spec.marks = OrderedMap.from(spec.marks)

    // :: Object<NodeType>
    // An object mapping the schema's node names to node type objects.
    this.nodes = NodeType.compile(this.spec.nodes, this)

    // :: Object<MarkType>
    // A map from mark names to mark type objects.
    this.marks = MarkType.compile(this.spec.marks, this)

    for (let prop in this.nodes) {
      if (prop in this.marks)
        throw new RangeError(prop + " can not be both a node and a mark")
      let type = this.nodes[prop]
      type.contentExpr = ContentExpr.parse(type, this.spec.nodes.get(prop).content || "")
    }
    for (let prop in this.marks) {
      let type = this.marks[prop], excl = type.spec.excludes
      type.excluded = excl == null ? [type] : excl == "" ? [] : ContentExpr.gatherMarks(this, excl.split(" "))
    }

    // :: Object
    // An object for storing whatever values modules may want to
    // compute and cache per schema. (If you want to store something
    // in it, try to use property names unlikely to clash.)
    this.cached = Object.create(null)
    this.cached.wrappings = Object.create(null)

    this.nodeFromJSON = this.nodeFromJSON.bind(this)
    this.markFromJSON = this.markFromJSON.bind(this)

    // :: NodeType
    // The type of the [default top node](#model.SchemaSpec.topNode)
    // for this schema.
    this.topNodeType = this.nodes[this.spec.topNode || "doc"]
  }

  // :: (union<string, NodeType>, ?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → Node
  // Create a node in this schema. The `type` may be a string or a
  // `NodeType` instance. Attributes will be extended
  // with defaults, `content` may be a `Fragment`,
  // `null`, a `Node`, or an array of nodes.
  node(type, attrs, content, marks) {
    if (typeof type == "string")
      type = this.nodeType(type)
    else if (!(type instanceof NodeType))
      throw new RangeError("Invalid node type: " + type)
    else if (type.schema != this)
      throw new RangeError("Node type from different schema used (" + type.name + ")")

    return type.createChecked(attrs, content, marks)
  }

  // :: (string, ?[Mark]) → Node
  // Create a text node in the schema. Empty text nodes are not
  // allowed.
  text(text, marks) {
    let type = this.nodes.text
    return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks))
  }

  // :: (union<string, MarkType>, ?Object) → Mark
  // Create a mark with the given type and attributes.
  mark(type, attrs) {
    if (typeof type == "string") type = this.marks[type]
    return type.create(attrs)
  }

  // :: (Object) → Node
  // Deserialize a node from its JSON representation. This method is
  // bound.
  nodeFromJSON(json) {
    return Node.fromJSON(this, json)
  }

  // :: (Object) → Mark
  // Deserialize a mark from its JSON representation. This method is
  // bound.
  markFromJSON(json) {
    return Mark.fromJSON(this, json)
  }

  nodeType(name) {
    let found = this.nodes[name]
    if (!found) throw new RangeError("Unknown node type: " + name)
    return found
  }
}
exports.Schema = Schema
