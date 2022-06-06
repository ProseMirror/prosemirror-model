import ist from "ist"
import {Fragment, Schema, Node} from "prosemirror-model"
import {schema, eq, doc, blockquote, p, li, ul, em, strong, code, a, br, hr, img} from "prosemirror-test-builder"

let customSchema = new Schema({
  nodes: {
    doc: {content: "paragraph+"},
    paragraph: {content: "(text|contact)*"},
    text: { toDebugString() { return 'custom_text' } },
    contact: {
      inline: true,
      attrs: { name: {}, email: {} },
      leafText(node: Node) { return `${node.attrs.name} <${node.attrs.email}>` }
    },
    hard_break: { toDebugString() { return 'custom_hard_break' } }
  },
})

describe("Node", () => {
  describe("toString", () => {
    it("nests", () => {
      ist(doc(ul(li(p("hey"), p()), li(p("foo")))).toString(),
          'doc(bullet_list(list_item(paragraph("hey"), paragraph), list_item(paragraph("foo"))))')
    })

    it("shows inline children", () => {
      ist(doc(p("foo", img(), br(), "bar")).toString(),
          'doc(paragraph("foo", image, hard_break, "bar"))')
    })

    it("shows marks", () => {
      ist(doc(p("foo", em("bar", strong("quux")), code("baz"))).toString(),
          'doc(paragraph("foo", em("bar"), em(strong("quux")), code("baz")))')
    })
  })

  describe("cut", () => {
    function cut(doc: Node, cut: Node) {
      ist(doc.cut((doc as any).tag.a || 0, (doc as any).tag.b), cut, eq)
    }

    it("extracts a full block", () =>
       cut(doc(p("foo"), "<a>", p("bar"), "<b>", p("baz")),
           doc(p("bar"))))

    it("cuts text", () =>
       cut(doc(p("0"), p("foo<a>bar<b>baz"), p("2")),
           doc(p("bar"))))

    it("cuts deeply", () =>
       cut(doc(blockquote(ul(li(p("a"), p("b<a>c")), li(p("d")), "<b>", li(p("e"))), p("3"))),
           doc(blockquote(ul(li(p("c")), li(p("d")))))))

    it("works from the left", () =>
       cut(doc(blockquote(p("foo<b>bar"))),
           doc(blockquote(p("foo")))))

    it("works to the right", () =>
       cut(doc(blockquote(p("foo<a>bar"))),
           doc(blockquote(p("bar")))))

    it("preserves marks", () =>
       cut(doc(p("foo", em("ba<a>r", img(), strong("baz"), br()), "qu<b>ux", code("xyz"))),
           doc(p(em("r", img(), strong("baz"), br()), "qu"))))
  })

  describe("between", () => {
    function between(doc: Node, ...nodes: string[]) {
      let i = 0
      doc.nodesBetween((doc as any).tag.a, (doc as any).tag.b, (node, pos) => {
        if (i == nodes.length)
          throw new Error("More nodes iterated than listed (" + node.type.name + ")")
        let compare = node.isText ? node.text! : node.type.name
        if (compare != nodes[i++])
          throw new Error("Expected " + JSON.stringify(nodes[i - 1]) + ", got " + JSON.stringify(compare))
        if (!node.isText && doc.nodeAt(pos) != node)
          throw new Error("Pos " + pos + " does not point at node " + node + " " + doc.nodeAt(pos))
      })
    }

    it("iterates over text", () =>
       between(doc(p("foo<a>bar<b>baz")),
               "paragraph", "foobarbaz"))

    it("descends multiple levels", () =>
       between(doc(blockquote(ul(li(p("f<a>oo")), p("b"), "<b>"), p("c"))),
               "blockquote", "bullet_list", "list_item", "paragraph", "foo", "paragraph", "b"))

    it("iterates over inline nodes", () =>
       between(doc(p(em("x"), "f<a>oo", em("bar", img(), strong("baz"), br()), "quux", code("xy<b>z"))),
               "paragraph", "foo", "bar", "image", "baz", "hard_break", "quux", "xyz"))
  })

  describe("textBetween", () => {
    it("works when passing a custom function as leafText", () => {
      const d = doc(p("foo", img(), br()))
      ist(d.textBetween(0, d.content.size, '', (node) => {
        if (node.type.name === 'image') return '<image>'
        if (node.type.name === 'hard_break') return '<break>'
        return ""
      }), 'foo<image><break>')
    })

    it("works with leafText", () => {
      const d = customSchema.nodes.doc.createChecked({}, [
        customSchema.nodes.paragraph.createChecked({}, [
          customSchema.text("Hello "),
          customSchema.nodes.contact.createChecked({ name: "Alice", email: "alice@example.com" })
        ])
      ])
      ist(d.textBetween(0, d.content.size), 'Hello Alice <alice@example.com>')
    })

    it("should ignore leafText when passing a custom leafText", () => {
      const d = customSchema.nodes.doc.createChecked({}, [
        customSchema.nodes.paragraph.createChecked({}, [
          customSchema.text("Hello "),
          customSchema.nodes.contact.createChecked({ name: "Alice", email: "alice@example.com" })
        ])
      ])
      ist(d.textBetween(0, d.content.size, '', '<anonymous>'), 'Hello <anonymous>')
    })
  })

  describe("textContent", () => {
    it("works on a whole doc", () => {
      ist(doc(p("foo")).textContent, "foo")
    })

    it("works on a text node", () => {
      ist(schema.text("foo").textContent, "foo")
    })

    it("works on a nested element", () => {
      ist(doc(ul(li(p("hi")), li(p(em("a"), "b")))).textContent,
          "hiab")
    })
  })

  describe("from", () => {
    function from(arg: Node | Node[] | Fragment | null, expect: Node) {
      ist(expect.copy(Fragment.from(arg)), expect, eq)
    }

    it("wraps a single node", () =>
       from(schema.node("paragraph"), doc(p())))

    it("wraps an array", () =>
       from([schema.node("hard_break"), schema.text("foo")], p(br, "foo")))

    it("preserves a fragment", () =>
       from(doc(p("foo")).content, doc(p("foo"))))

    it("accepts null", () =>
       from(null, p()))

    it("joins adjacent text", () =>
       from([schema.text("a"), schema.text("b")], p("ab")))
  })

  describe("toJSON", () => {
    function roundTrip(doc: Node) {
      ist(schema.nodeFromJSON(doc.toJSON()), doc, eq)
    }

    it("can serialize a simple node", () => roundTrip(doc(p("foo"))))

    it("can serialize marks", () => roundTrip(doc(p("foo", em("bar", strong("baz")), " ", a("x")))))

    it("can serialize inline leaf nodes", () => roundTrip(doc(p("foo", em(img(), "bar")))))

    it("can serialize block leaf nodes", () => roundTrip(doc(p("a"), hr(), p("b"), p())))

    it("can serialize nested nodes", () => roundTrip(doc(blockquote(ul(li(p("a"), p("b")), li(p(img()))), p("c")), p("d"))))
  })

  describe("toString", () => {
    it("should have the default toString method [text]", () => ist(schema.text("hello").toString(), "\"hello\""))
    it("should have the default toString method [br]", () => ist(br().toString(), "hard_break"))

    it("should be able to redefine it from NodeSpec by specifying toDebugString method",
       () => ist(customSchema.text("hello").toString(), "custom_text"))

    it("should be respected by Fragment", () =>
      ist(
        Fragment.fromArray(
          [customSchema.text("hello"), customSchema.nodes.hard_break.createChecked(), customSchema.text("world")]
        ),
        "<custom_text, custom_hard_break, custom_text>"
      )
    )
  })

  describe("leafText", () => {
    it("should custom the textContent of a leaf node", () => {
      let contact = customSchema.nodes.contact.createChecked({ name: "Bob", email: "bob@example.com" })
      let paragraph = customSchema.nodes.paragraph.createChecked({}, [customSchema.text('Hello '), contact])

      ist(contact.textContent, "Bob <bob@example.com>")
      ist(paragraph.textContent, "Hello Bob <bob@example.com>")
    })
  })
})
