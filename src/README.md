This module defines ProseMirror's content model, the data structures
used to represent and manipulate documents.

### Document Structure

A ProseMirror document is a tree. At each level, a [node](#model.Node)
tags the type of content that's there, and holds a
[fragment](#model.Fragment) containing its children.

@Node
@Fragment
@Mark
@Slice
@ReplaceError

### Resolved Positions

Positions in a document can be represented as integer
[offsets](guide/doc.html#indexing). But you'll often want to use a
more convenient representation.

@ResolvedPos
@NodeRange

### Document Schema

The schema to which a document must conform is another data structure.
It describes the [nodes](#model.NodeSpec) and [marks](#model.MarkSpec)
that may appear in a document, and the places at which they may
appear.

@Schema

@SchemaSpec
@NodeSpec
@MarkSpec
@AttributeSpec

@NodeType
@MarkType

@ContentMatch

### DOM Representation

Because representing a document as a tree of DOM nodes is central to
the way ProseMirror operates, DOM [parsing](#model.DOMParser) and
[serializing](#model.DOMSerializer) is integrated with the model.

(But note that you do _not_ need to have a DOM implementation loaded
to load this module.)

@DOMParser
@ParseRule

@DOMSerializer
@DOMOutputSpec
