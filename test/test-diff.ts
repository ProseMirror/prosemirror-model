import {doc, blockquote, h1, h2, p, em, strong} from "prosemirror-test-builder"
import {Node} from "prosemirror-model"
import ist from "ist"

describe("Fragment", () => {
  describe("findDiffStart", () => {
    function start(a: Node, b: Node) {
      ist(a.content.findDiffStart(b.content), (a as any).tag.a)
    }

    it("returns null for identical nodes", () =>
       start(doc(p("a", em("b")), p("hello"), blockquote(h1("bye"))),
             doc(p("a", em("b")), p("hello"), blockquote(h1("bye")))))

    it("notices when one node is longer", () =>
       start(doc(p("a", em("b")), p("hello"), blockquote(h1("bye")), "<a>"),
             doc(p("a", em("b")), p("hello"), blockquote(h1("bye")), p("oops"))))

    it("notices when one node is shorter", () =>
       start(doc(p("a", em("b")), p("hello"), blockquote(h1("bye")), "<a>", p("oops")),
             doc(p("a", em("b")), p("hello"), blockquote(h1("bye")))))

    it("notices differing marks", () =>
       start(doc(p("a<a>", em("b"))),
             doc(p("a", strong("b")))))

    it("stops at longer text", () =>
       start(doc(p("foo<a>bar", em("b"))),
             doc(p("foo", em("b")))))

    it("stops at a different character", () =>
       start(doc(p("foo<a>bar")),
             doc(p("foocar"))))

    it("stops at a different node type", () =>
       start(doc(p("a"), "<a>", p("b")),
             doc(p("a"), h1("b"))))

    it("works when the difference is at the start", () =>
       start(doc("<a>", p("b")),
             doc(h1("b"))))

    it("notices a different attribute", () =>
       start(doc(p("a"), "<a>", h1("foo")),
             doc(p("a"), h2("foo"))))
  })

  describe("findDiffEnd", () => {
    function end(a: Node, b: Node) {
      let found = a.content.findDiffEnd(b.content)
      ist(found && found.a, (a as any).tag.a)
    }

    it("returns null when there is no difference", () =>
       end(doc(p("a", em("b")), p("hello"), blockquote(h1("bye"))),
           doc(p("a", em("b")), p("hello"), blockquote(h1("bye")))))

    it("notices when the second doc is longer", () =>
       end(doc("<a>", p("a", em("b")), p("hello"), blockquote(h1("bye"))),
           doc(p("oops"), p("a", em("b")), p("hello"), blockquote(h1("bye")))))

    it("notices when the second doc is shorter", () =>
       end(doc(p("oops"), "<a>", p("a", em("b")), p("hello"), blockquote(h1("bye"))),
           doc(p("a", em("b")), p("hello"), blockquote(h1("bye")))))

    it("notices different styles", () =>
       end(doc(p("a", em("b"), "<a>c")),
           doc(p("a", strong("b"), "c"))))

    it("spots longer text", () =>
       end(doc(p("bar<a>foo", em("b"))),
           doc(p("foo", em("b")))))

    it("spots different text", () =>
       end(doc(p("foob<a>ar")),
           doc(p("foocar"))))

    it("notices different nodes", () =>
       end(doc(p("a"), "<a>", p("b")),
           doc(h1("a"), p("b"))))

    it("notices a difference at the end", () =>
       end(doc(p("b"), "<a>"),
           doc(h1("b"))))

    it("handles a similar start", () =>
       end(doc("<a>", p("hello")),
           doc(p("hey"), p("hello"))))
  })
})
