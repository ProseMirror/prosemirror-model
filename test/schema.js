const {Schema} = require("../src")

exports.schema = new Schema({
  nodes: {
    doc: {
      content: "block+"
    },

    paragraph: {
      content: "inline<_>*",
      group: "block",
      matchDOMTag: {"p": null},
      toDOM() { return ["p", 0] }
    },

    blockquote: {
      content: "block+",
      group: "block",
      matchDOMTag: {"blockquote": null},
      toDOM() { return ["blockquote", 0] }
    },

    horizontal_rule: {
      group: "block",
      matchDOMTag: {"hr": null},
      toDOM() { return ["div", ["hr"]] }
    },

    heading: {
      attrs: {level: {default: 1}},
      content: "inline<_>*",
      group: "block",
      matchDOMTag: {
        "h1": {level: 1}, "h2": {level: 2}, "h3": {level: 3},
        "h4": {level: 4}, "h5": {level: 5}, "h6": {level: 6}
      },
      toDOM(node) { return ["h" + node.attrs.level, 0] }
    },

    code_block: {
      content: "text*",
      group: "block",
      code: true,
      matchDOMTag: {"pre": [null, {preserveWhitespace: true}]},
      toDOM() { return ["pre", ["code", 0]] }
    },

    ordered_list: {
      content: "list_item+",
      group: "block",
      attrs: {order: {default: 1}},
      matchDOMTag: {"ol": dom => ({
        order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1
      })},
      toDOM(node) {
        return ["ol", {start: node.attrs.order == 1 ? null : node.attrs.order}, 0]
      }
    },

    bullet_list: {
      content: "list_item+",
      group: "block",
      matchDOMTag: {"ul": null},
      toDOM() { return ["ul", 0] }
    },

    list_item: {
      content: "paragraph block*",
      matchDOMTag: {"li": null},
      toDOM() { return ["li", 0] }
    },

    text: {
      text: true,
      group: "inline",
      selectable: false,
      toDOM(node) { return node.text }
    },

    image: {
      inline: true,
      attrs: {
        src: {},
        alt: {default: ""},
        title: {default: ""}
      },
      group: "inline",
      draggable: true,
      matchDOMTag: {"img[src]": dom => ({
        src: dom.getAttribute("src"),
        title: dom.getAttribute("title"),
        alt: dom.getAttribute("alt")
      })},
      toDOM(node) { return ["img", node.attrs] }
    },

    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      isBR: true,
      matchDOMTag: {"br": null},
      toDOM() { return ["br"] }
    }
  },

  marks: {
    em: {
      matchDOMTag: {"i": null, "em": null},
      matchDOMStyle: {"font-style": value => value == "italic" && null},
      toDOM() { return ["em"] }
    },

    strong: {
      matchDOMTag: {"b": null, "strong": null},
      matchDOMStyle: {"font-weight": value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null},
      toDOM() { return ["strong"] }
    },

    link: {
      attrs: {
        href: {},
        title: {default: ""}
      },
      matchDOMTag: {"a[href]": dom => ({
        href: dom.getAttribute("href"), title: dom.getAttribute("title")
      })},
      toDOM(node) { return ["a", node.attrs] }
    },

    code: {
      matchDOMTag: {"code": null},
      toDOM() { return ["code"] }
    }
  }
})
