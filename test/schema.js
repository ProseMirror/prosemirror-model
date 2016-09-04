const {Schema, Block, Inline, Text, Attribute, MarkType} = require("../src")

class Doc extends Block {}

class BlockQuote extends Block {
  get matchDOMTag() { return {"blockquote": null} }
  toDOM() { return ["blockquote", 0] }
}

class HorizontalRule extends Block {
  get matchDOMTag() { return {"hr": null} }
  toDOM() { return ["div", ["hr"]] }
}

class Heading extends Block {
  get attrs() { return {level: new Attribute({default: 1})} }
  get matchDOMTag() {
    return {"h1": {level: 1}, "h2": {level: 2}, "h3": {level: 3},
            "h4": {level: 4}, "h5": {level: 5}, "h6": {level: 6}}
  }
  toDOM(node) { return ["h" + node.attrs.level, 0] }
}

class CodeBlock extends Block {
  get isCode() { return true }
  get matchDOMTag() { return {"pre": [null, {preserveWhitespace: true}]} }
  toDOM() { return ["pre", ["code", 0]] }
}

class Paragraph extends Block {
  get matchDOMTag() { return {"p": null} }
  toDOM() { return ["p", 0] }
}

class Image extends Inline {
  get attrs() {
    return {
      src: new Attribute,
      alt: new Attribute({default: ""}),
      title: new Attribute({default: ""})
    }
  }
  get draggable() { return true }
  get matchDOMTag() {
    return {"img[src]": dom => ({
      src: dom.getAttribute("src"),
      title: dom.getAttribute("title"),
      alt: dom.getAttribute("alt")
    })}
  }
  toDOM(node) { return ["img", node.attrs] }
}

class HardBreak extends Inline {
  get selectable() { return false }
  get isBR() { return true }
  get matchDOMTag() { return {"br": null} }
  toDOM() { return ["br"] }
}

class EmMark extends MarkType {
  get matchDOMTag() { return {"i": null, "em": null} }
  get matchDOMStyle() {
    return {"font-style": value => value == "italic" && null}
  }
  toDOM() { return ["em"] }
}

class StrongMark extends MarkType {
  get matchDOMTag() { return {"b": null, "strong": null} }
  get matchDOMStyle() {
    return {"font-weight": value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null}
  }
  toDOM() { return ["strong"] }
}

class LinkMark extends MarkType {
  get attrs() {
    return {
      href: new Attribute,
      title: new Attribute({default: ""})
    }
  }
  get matchDOMTag() {
    return {"a[href]": dom => ({
      href: dom.getAttribute("href"), title: dom.getAttribute("title")
    })}
  }
  toDOM(node) { return ["a", node.attrs] }
}

class CodeMark extends MarkType {
  get isCode() { return true }
  get matchDOMTag() { return {"code": null} }
  toDOM() { return ["code"] }
}

class OrderedList extends Block {
  get attrs() { return {order: new Attribute({default: 1})} }
  get matchDOMTag() {
    return {"ol": dom => ({
      order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1
    })}
  }
  toDOM(node) {
    return ["ol", {start: node.attrs.order == 1 ? null : node.attrs.order}, 0]
  }
}

class BulletList extends Block {
  get matchDOMTag() { return {"ul": null} }
  toDOM() { return ["ul", 0] }
}

class ListItem extends Block {
  get matchDOMTag() { return {"li": null} }
  toDOM() { return ["li", 0] }
}

const schema = new Schema({
  nodes: {
    doc: {type: Doc, content: "block+"},

    paragraph: {type: Paragraph, content: "inline<_>*", group: "block"},
    blockquote: {type: BlockQuote, content: "block+", group: "block"},
    horizontal_rule: {type: HorizontalRule, group: "block"},
    heading: {type: Heading, content: "inline<_>*", group: "block"},
    code_block: {type: CodeBlock, content: "text*", group: "block"},

    ordered_list: {type: OrderedList, content: "list_item+", group: "block"},
    bullet_list: {type: BulletList, content: "list_item+", group: "block"},
    list_item: {type: ListItem, content: "paragraph block*"},

    text: {type: Text, group: "inline"},
    image: {type: Image, group: "inline"},
    hard_break: {type: HardBreak, group: "inline"}
  },

  marks: {
    em: EmMark,
    strong: StrongMark,
    link: LinkMark,
    code: CodeMark
  }
})
exports.schema = schema
