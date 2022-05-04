import {Slice, Node} from "prosemirror-model"
import {eq, doc, blockquote, h1, p, ul, li} from "prosemirror-test-builder"
import ist from "ist"

describe("Node", () => {
  describe("replace", () => {
    function rpl(doc: Node, insert: Node | null, expected: Node) {
      let slice = insert ? insert.slice((insert as any).tag.a, (insert as any).tag.b) : Slice.empty
      ist(doc.replace((doc as any).tag.a, (doc as any).tag.b, slice), expected, eq)
    }

    it("joins on delete", () =>
       rpl(doc(p("on<a>e"), p("t<b>wo")), null, doc(p("onwo"))))

    it("merges matching blocks", () =>
       rpl(doc(p("on<a>e"), p("t<b>wo")), doc(p("xx<a>xx"), p("yy<b>yy")), doc(p("onxx"), p("yywo"))))

    it("merges when adding text", () =>
       rpl(doc(p("on<a>e"), p("t<b>wo")),
           doc(p("<a>H<b>")),
           doc(p("onHwo"))))

    it("can insert text", () =>
       rpl(doc(p("before"), p("on<a><b>e"), p("after")),
           doc(p("<a>H<b>")),
           doc(p("before"), p("onHe"), p("after"))))

    it("doesn't merge non-matching blocks", () =>
       rpl(doc(p("on<a>e"), p("t<b>wo")),
           doc(h1("<a>H<b>")),
           doc(p("onHwo"))))

    it("can merge a nested node", () =>
       rpl(doc(blockquote(blockquote(p("on<a>e"), p("t<b>wo")))),
           doc(p("<a>H<b>")),
           doc(blockquote(blockquote(p("onHwo"))))))

    it("can replace within a block", () =>
       rpl(doc(blockquote(p("a<a>bc<b>d"))),
           doc(p("x<a>y<b>z")),
           doc(blockquote(p("ayd")))))

    it("can insert a lopsided slice", () =>
       rpl(doc(blockquote(blockquote(p("on<a>e"), p("two"), "<b>", p("three")))),
           doc(blockquote(p("aa<a>aa"), p("bb"), p("cc"), "<b>", p("dd"))),
           doc(blockquote(blockquote(p("onaa"), p("bb"), p("cc"), p("three"))))))

    it("can insert a deep, lopsided slice", () =>
       rpl(doc(blockquote(blockquote(p("on<a>e"), p("two"), p("three")), "<b>", p("x"))),
           doc(blockquote(p("aa<a>aa"), p("bb"), p("cc")), "<b>", p("dd")),
           doc(blockquote(blockquote(p("onaa"), p("bb"), p("cc")), p("x")))))

    it("can merge multiple levels", () =>
       rpl(doc(blockquote(blockquote(p("hell<a>o"))), blockquote(blockquote(p("<b>a")))),
           null,
           doc(blockquote(blockquote(p("hella"))))))

    it("can merge multiple levels while inserting", () =>
       rpl(doc(blockquote(blockquote(p("hell<a>o"))), blockquote(blockquote(p("<b>a")))),
           doc(p("<a>i<b>")),
           doc(blockquote(blockquote(p("hellia"))))))

    it("can insert a split", () =>
       rpl(doc(p("foo<a><b>bar")),
           doc(p("<a>x"), p("y<b>")),
           doc(p("foox"), p("ybar"))))

    it("can insert a deep split", () =>
       rpl(doc(blockquote(p("foo<a>x<b>bar"))),
           doc(blockquote(p("<a>x")), blockquote(p("y<b>"))),
           doc(blockquote(p("foox")), blockquote(p("ybar")))))

    it("can add a split one level up", () =>
       rpl(doc(blockquote(p("foo<a>u"), p("v<b>bar"))),
           doc(blockquote(p("<a>x")), blockquote(p("y<b>"))),
           doc(blockquote(p("foox")), blockquote(p("ybar")))))

    it("keeps the node type of the left node", () =>
       rpl(doc(h1("foo<a>bar"), "<b>"),
           doc(p("foo<a>baz"), "<b>"),
           doc(h1("foobaz"))))

    it("keeps the node type even when empty", () =>
       rpl(doc(h1("<a>bar"), "<b>"),
           doc(p("foo<a>baz"), "<b>"),
           doc(h1("baz"))))

    function bad(doc: Node, insert: Node | null, pattern: string) {
      let slice = insert ? insert.slice((insert as any).tag.a, (insert as any).tag.b) : Slice.empty
      ist.throws(() => doc.replace((doc as any).tag.a, (doc as any).tag.b, slice), new RegExp(pattern, "i"))
    }

    it("doesn't allow the left side to be too deep", () =>
       bad(doc(p("<a><b>")),
           doc(blockquote(p("<a>")), "<b>"),
           "deeper"))

    it("doesn't allow a depth mismatch", () =>
       bad(doc(p("<a><b>")),
           doc("<a>", p("<b>")),
           "inconsistent"))

    it("rejects a bad fit", () =>
       bad(doc("<a><b>"),
           doc(p("<a>foo<b>")),
           "invalid content"))

    it("rejects unjoinable content", () =>
       bad(doc(ul(li(p("a")), "<a>"), "<b>"),
           doc(p("foo", "<a>"), "<b>"),
           "cannot join"))

    it("rejects an unjoinable delete", () =>
       bad(doc(blockquote(p("a"), "<a>"), ul("<b>", li(p("b")))),
           null,
           "cannot join"))

    it("check content validity", () =>
       bad(doc(blockquote("<a>", p("hi")), "<b>"),
           doc(blockquote("hi", "<a>"), "<b>"),
           "invalid content"))
  })
})
