// !!
// This module defines ProseMirror's document model, the data
// structure used to define and inspect content documents.

exports.Node = require("./node").Node
;({ResolvedPos: exports.ResolvedPos, NodeRange: exports.NodeRange} = require("./resolvedpos"))
exports.Fragment = require("./fragment").Fragment
;({Slice: exports.Slice, ReplaceError: exports.ReplaceError} = require("./replace"))
exports.Mark = require("./mark").Mark

;({SchemaSpec: exports.SchemaSpec, Schema: exports.Schema, NodeType: exports.NodeType,
   Block: exports.Block, Inline: exports.Inline, Text: exports.Text,
   MarkType: exports.MarkType, Attribute: exports.Attribute, NodeKind: exports.NodeKind} = require("./schema"))
;({ContentMatch: exports.ContentMatch} = require("./content"))

exports.parseDOMInContext = require("./from_dom").parseDOMInContext
