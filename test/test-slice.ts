import {doc, p, li, ul, em, a, blockquote} from "prosemirror-test-builder"
import {Node} from "prosemirror-model"
import ist from "ist"

describe("Node", () => {
  describe("slice", () => {
    function t(doc: Node, expect: Node, openStart: number, openEnd: number) {
      let slice = doc.slice((doc as any).tag.a || 0, (doc as any).tag.b)
      ist(slice.content.eq(expect.content))
      ist(slice.openStart, openStart)
      ist(slice.openEnd, openEnd)
    }

    it("can cut half a paragraph", () =>
       t(doc(p("hello<b> world")), doc(p("hello")), 0, 1))

    it("can cut to the end of a pragraph", () =>
       t(doc(p("hello<b>")), doc(p("hello")), 0, 1))

    it("leaves off extra content", () =>
       t(doc(p("hello<b> world"), p("rest")), doc(p("hello")), 0, 1))

    it("preserves styles", () =>
       t(doc(p("hello ", em("WOR<b>LD"))), doc(p("hello ", em("WOR"))), 0, 1))

    it("can cut multiple blocks", () =>
       t(doc(p("a"), p("b<b>")), doc(p("a"), p("b")), 0, 1))

    it("can cut to a top-level position", () =>
       t(doc(p("a"), "<b>", p("b")), doc(p("a")), 0, 0))

    it("can cut to a deep position", () =>
       t(doc(blockquote(ul(li(p("a")), li(p("b<b>"))))),
         doc(blockquote(ul(li(p("a")), li(p("b"))))), 0, 4))

    it("can cut everything after a position", () =>
       t(doc(p("hello<a> world")), doc(p(" world")), 1, 0))

    it("can cut from the start of a textblock", () =>
       t(doc(p("<a>hello")), doc(p("hello")), 1, 0))

    it("leaves off extra content before", () =>
       t(doc(p("foo"), p("bar<a>baz")), doc(p("baz")), 1, 0))

    it("preserves styles after cut", () =>
       t(doc(p("a sentence with an ", em("emphasized ", a("li<a>nk")), " in it")),
         doc(p(em(a("nk")), " in it")), 1, 0))

    it("preserves styles started after cut", () =>
       t(doc(p("a ", em("sentence"), " wi<a>th ", em("text"), " in it")),
         doc(p("th ", em("text"), " in it")), 1, 0))

    it("can cut from a top-level position", () =>
       t(doc(p("a"), "<a>", p("b")), doc(p("b")), 0, 0))

    it("can cut from a deep position", () =>
       t(doc(blockquote(ul(li(p("a")), li(p("<a>b"))))),
         doc(blockquote(ul(li(p("b"))))), 4, 0))

    it("can cut part of a text node", () =>
       t(doc(p("hell<a>o wo<b>rld")), p("o wo"), 0, 0))

    it("can cut across paragraphs", () =>
       t(doc(p("on<a>e"), p("t<b>wo")), doc(p("e"), p("t")), 1, 1))

    it("can cut part of marked text", () =>
       t(doc(p("here's noth<a>ing and ", em("here's e<b>m"))),
         p("ing and ", em("here's e")), 0, 0))

    it("can cut across different depths", () =>
       t(doc(ul(li(p("hello")), li(p("wo<a>rld")), li(p("x"))), p(em("bo<b>o"))),
         doc(ul(li(p("rld")), li(p("x"))), p(em("bo"))), 3, 1))

    it("can cut between deeply nested nodes", () =>
       t(doc(blockquote(p("foo<a>bar"), ul(li(p("a")), li(p("b"), "<b>", p("c"))), p("d"))),
         blockquote(p("bar"), ul(li(p("a")), li(p("b")))), 1, 2))

    it("can include parents", () => {
      let d = doc(blockquote(p("fo<a>o"), p("bar<b>")))
      let slice = d.slice((d as any).tag.a, (d as any).tag.b, true)
      ist(slice.toString(), '<blockquote(paragraph("o"), paragraph("bar"))>(2,2)')
    })
  })
})
