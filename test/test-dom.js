const {schema, eq, doc, blockquote, pre, h1, h2, p, li, ol, ul, em, strong, code, a, br, img, hr} = require("prosemirror-test-builder")
const ist = require("ist")
const {DOMParser, DOMSerializer, Slice, Fragment, Schema} = require("../dist")

// declare global: window
let document = typeof window == "undefined" ? require("jsdom").jsdom() : window.document

const parser = DOMParser.fromSchema(schema)
const serializer = DOMSerializer.fromSchema(schema)

describe("DOMParser", () => {
  describe("parse", () => {
    function domFrom(html) {
      let dom = document.createElement("div")
      dom.innerHTML = html
      return dom
    }

    function test(doc, html) {
      return () => {
        let derivedDOM = document.createElement("div")
        derivedDOM.appendChild(serializer.serializeFragment(doc.content, {document}))
        let declaredDOM = domFrom(html)

        ist(derivedDOM.innerHTML, declaredDOM.innerHTML)
        ist(DOMParser.fromSchema(doc.type.schema).parse(derivedDOM), doc, eq)
      }
    }

    it("can represent simple node",
       test(doc(p("hello")),
            "<p>hello</p>"))

    it("can represent a line break",
       test(doc(p("hi", br, "there")),
            "<p>hi<br/>there</p>"))

    it("can represent an image",
       test(doc(p("hi", img({alt: "x"}), "there")),
            '<p>hi<img src="img.png" alt="x"/>there</p>'))

    it("joins styles",
       test(doc(p("one", strong("two", em("three")), em("four"), "five")),
            "<p>one<strong>two</strong><em><strong>three</strong>four</em>five</p>"))

    it("can represent links",
       test(doc(p("a ", a({href: "foo"}, "big ", a({href: "bar"}, "nested"), " link"))),
            "<p>a <a href=\"foo\">big </a><a href=\"bar\">nested</a><a href=\"foo\"> link</a></p>"))

    it("can represent and unordered list",
       test(doc(ul(li(p("one")), li(p("two")), li(p("three", strong("!")))), p("after")),
            "<ul><li><p>one</p></li><li><p>two</p></li><li><p>three<strong>!</strong></p></li></ul><p>after</p>"))

    it("can represent an ordered list",
       test(doc(ol(li(p("one")), li(p("two")), li(p("three", strong("!")))), p("after")),
            "<ol><li><p>one</p></li><li><p>two</p></li><li><p>three<strong>!</strong></p></li></ol><p>after</p>"))

    it("can represent a blockquote",
       test(doc(blockquote(p("hello"), p("bye"))),
            "<blockquote><p>hello</p><p>bye</p></blockquote>"))

    it("can represent a nested blockquote",
       test(doc(blockquote(blockquote(blockquote(p("he said"))), p("i said"))),
            "<blockquote><blockquote><blockquote><p>he said</p></blockquote></blockquote><p>i said</p></blockquote>"))

    it("can represent headings",
       test(doc(h1("one"), h2("two"), p("text")),
            "<h1>one</h1><h2>two</h2><p>text</p>"))

    it("can represent inline code",
       test(doc(p("text and ", code("code that is ", em("emphasized"), "..."))),
            "<p>text and <code>code that is </code><em><code>emphasized</code></em><code>...</code></p>"))

    it("can represent a code block",
       test(doc(blockquote(pre("some code")), p("and")),
            "<blockquote><pre><code>some code</code></pre></blockquote><p>and</p>"))

    it("supports leaf nodes in marks",
       test(doc(p(em("hi", br, "x"))),
            "<p><em>hi<br>x</em></p>"))

    function recover(html, doc, options) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        ist(parser.parse(dom, options), doc, eq)
      }
    }

    it("can recover a list item",
       recover("<ol><p>Oh no</p></ol>",
               doc(ol(li(p("Oh no"))))))

    it("wraps a list item in a list",
       recover("<li>hey</li>",
               doc(ol(li(p("hey"))))))

    it("can turn divs into paragraphs",
       recover("<div>hi</div><div>bye</div>",
               doc(p("hi"), p("bye"))))

    it("interprets <i> and <b> as emphasis and strong",
       recover("<p><i>hello <b>there</b></i></p>",
               doc(p(em("hello ", strong("there"))))))

    it("wraps stray text in a paragraph",
       recover("hi",
               doc(p("hi"))))

    it("ignores an extra wrapping <div>",
       recover("<div><p>one</p><p>two</p></div>",
               doc(p("one"), p("two"))))

    it("ignores meaningless whitespace",
       recover(" <blockquote> <p>woo  \n  <em> hooo</em></p> </blockquote> ",
               doc(blockquote(p("woo ", em("hooo"))))))

    it("finds a valid place for invalid content",
       recover("<ul><li>hi</li><p>whoah</p><li>again</li></ul>",
               doc(ul(li(p("hi")), li(p("whoah")), li(p("again"))))))

    it("moves nodes up when they don't fit the current context",
       recover("<div>hello<hr/>bye</div>",
               doc(p("hello"), hr, p("bye"))))

    it("doesn't ignore whitespace-only text nodes",
       recover("<p><em>one</em> <strong>two</strong></p>",
               doc(p(em("one"), " ", strong("two")))))

    it("can handle stray tab characters",
       recover("<p> <b>&#09;</b></p>",
               doc(p())))

    it("normalizes random spaces",
       recover("<p><b>1 </b>  </p>",
               doc(p(strong("1")))))

    it("can parse an empty code block",
       recover("<pre></pre>",
               doc(pre())))

    it("preserves trailing space in a code block",
       recover("<pre>foo\n</pre>",
               doc(pre("foo\n"))))

    it("normalizes newlines when preserving whitespace",
       recover("<p>foo  bar\nbaz</p>",
              doc(p("foo  bar baz")), {preserveWhitespace: true}))

    it("ignores <script> tags",
       recover("<p>hello<script>alert('x')</script>!</p>",
               doc(p("hello!"))))

    it("can handle a head/body input structure",
       recover("<head><title>T</title><meta charset='utf8'/></head><body>hi</body>",
               doc(p("hi"))))

    it("only applies a mark once",
       recover("<p>A <strong>big <strong>strong</strong> monster</strong>.</p>",
               doc(p("A ", strong("big strong monster"), "."))))

    it("interprets font-weight: bold as strong",
       recover("<p style='font-weight: bold'>Hello</p>",
               doc(p(strong("Hello")))))

    it("ignores unknown inline tags",
       recover("<p><u>a</u>bc</p>",
               doc(p("abc"))))

    function parse(html, options, doc) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let result = parser.parse(dom, options)
        ist(result, doc, eq)
      }
    }

    it("accepts the topNode option",
       parse("<li>wow</li><li>such</li>", {topNode: schema.nodes.bullet_list.createAndFill()},
             ul(li(p("wow")), li(p("such")))))

    it("accepts the topStart option",
       parse("<ul><li>x</li></ul>", {topNode: schema.nodes.list_item.createAndFill(), topStart: 1},
             li(ul(li(p("x"))))))

    it("accepts from and to options",
       parse("<hr><p>foo</p><p>bar</p><img>", {from: 1, to: 3},
             doc(p("foo"), p("bar"))))

    it("accepts the preserveWhitespace option",
       parse("foo   bar", {preserveWhitespace: true},
             doc(p("foo   bar"))))

    function open(html, nodes, openStart, openEnd) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let result = parser.parseSlice(dom)
        ist(result, new Slice(Fragment.from(nodes.map(n => typeof n == "string" ? schema.text(n) : n)), openStart, openEnd), eq)
      }
    }

    it("can parse an open slice",
       open("foo", ["foo"], 0, 0))

    it("will accept weird siblings",
       open("foo<p>bar</p>", ["foo", p("bar")], 0, 1))

    it("will open all the way to the inner nodes",
       open("<ul><li>foo</li><li>bar<br></li></ul>", [ul(li(p("foo")), li(p("bar", br)))], 3, 3))

    it("accepts content open to the left",
       open("<li><ul><li>a</li></ul></li>", [li(ul(li(p("a"))))], 4, 4))

    it("accepts content open to the right",
       open("<li>foo</li><li></li>", [li(p("foo")), li()], 2, 1))

    it("will create textblocks for block nodes",
       open("<div><div>foo</div><div>bar</div></div>", [p("foo"), p("bar")], 1, 1))

    function find(html, doc) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let tag = dom.querySelector("var"), prev = tag.previousSibling, next = tag.nextSibling, pos
        if (prev && next && prev.nodeType == 3 && next.nodeType == 3) {
          pos = {node: prev, offset: prev.nodeValue.length}
          prev.nodeValue += next.nodeValue
          next.parentNode.removeChild(next)
        } else {
          pos = {node: tag.parentNode, offset: Array.prototype.indexOf.call(tag.parentNode.childNodes, tag)}
        }
        tag.parentNode.removeChild(tag)
        let result = parser.parse(dom, {
          findPositions: [pos]
        })
        ist(result, doc, eq)
        ist(pos.pos, doc.tag.a)
      }
    }

    it("can find a position at the start of a paragraph",
       find("<p><var></var>hello</p>",
            doc(p("<a>hello"))))

    it("can find a position at the end of a paragraph",
       find("<p>hello<var></var></p>",
            doc(p("hello<a>"))))

    it("can find a position inside text",
       find("<p>hel<var></var>lo</p>",
            doc(p("hel<a>lo"))))

    it("can find a position inside an ignored node",
       find("<p>hi</p><object><var></var>foo</object><p>ok</p>",
            doc(p("hi"), "<a>", p("ok"))))

    it("can find a position between nodes",
       find("<ul><li>foo</li><var></var><li>bar</li></ul>",
            doc(ul(li(p("foo")), "<a>", li(p("bar"))))))

    it("can find a position at the start of the document",
       find("<var></var><p>hi</p>",
            doc("<a>", p("hi"))))

    it("can find a position at the end of the document",
       find("<p>hi</p><var></var>",
            doc(p("hi"), "<a>")))

    let quoteSchema = new Schema({nodes: schema.spec.nodes, marks: schema.spec.marks, topNode: "blockquote"})

    it("uses a custom top node when parsing",
       test(quoteSchema.node("blockquote", null, quoteSchema.node("paragraph", null, quoteSchema.text("hello"))),
            "<p>hello</p>"))

    function contextParser(context) {
      return new DOMParser(schema, [{tag: "foo", node: "horizontal_rule", context}].concat(DOMParser.schemaRules(schema)))
    }

    it("recognizes context restrictions", () => {
      ist(contextParser("blockquote/").parse(domFrom("<foo></foo><blockquote><foo></foo><p><foo></foo></p></blockquote>")),
          doc(blockquote(hr, p())), eq)
    })

    it("accepts group names in contexts", () => {
      ist(contextParser("block/").parse(domFrom("<foo></foo><blockquote><foo></foo><p></p></blockquote>")),
          doc(blockquote(hr, p())), eq)
    })

    it("understands nested context restrictions", () => {
      ist(contextParser("blockquote/ordered_list//")
          .parse(domFrom("<foo></foo><blockquote><foo></foo><ol><li><p>a</p><foo></foo></li></ol></blockquote>")),
          doc(blockquote(ol(li(p("a"), hr)))), eq)
    })

    it("understands double slashes in context restrictions", () => {
      ist(contextParser("blockquote//list_item/")
          .parse(domFrom("<foo></foo><blockquote><foo></foo><ol><foo></foo><li><p>a</p><foo></foo></li></ol></blockquote>")),
          doc(blockquote(ol(li(p("a"), hr)))), eq)
    })

    it("uses the passed context", () => {
      let cxDoc = doc(blockquote("<a>", hr))
      ist(contextParser("doc//blockquote/").parse(domFrom("<blockquote><foo></foo></blockquote>"), {
        topNode: blockquote(),
        context: cxDoc.resolve(cxDoc.tag.a)
      }), blockquote(blockquote(hr)), eq)
    })

    it("uses the passed context when parsing a slice", () => {
      let cxDoc = doc(blockquote("<a>", hr))
      ist(contextParser("doc//blockquote/").parseSlice(domFrom("<foo></foo>"), {
        context: cxDoc.resolve(cxDoc.tag.a)
      }), new Slice(blockquote(hr).content, 0, 0), eq)
    })
  })

  describe("schemaRules", () => {
    it("defaults to schema order", () => {
      let schema = new Schema({
        marks: {em: {parseDOM: [{tag: "i"}, {tag: "em"}]}},
        nodes: {doc: {content: "inline*"},
                text: {group: "inline"},
                foo: {group: "inline", inline: true, parseDOM: [{tag: "foo"}]},
                bar: {group: "inline", inline: true, parseDOM: [{tag: "bar"}]}}
      })
      ist(DOMParser.schemaRules(schema).map(r => r.tag).join(" "), "i em foo bar")
    })

    it("understands priority", () => {
      let schema = new Schema({
        marks: {em: {parseDOM: [{tag: "i", priority: 40}, {tag: "em", priority: 70}]}},
        nodes: {doc: {content: "inline*"},
                text: {group: "inline"},
                foo: {group: "inline", inline: true, parseDOM: [{tag: "foo"}]},
                bar: {group: "inline", inline: true, parseDOM: [{tag: "bar", priority: 60}]}}
      })
      ist(DOMParser.schemaRules(schema).map(r => r.tag).join(" "), "em bar foo i")
    })
  })
})

describe("DOMSerializer", () => {
  it("can omit a mark", () => {
    let s = new DOMSerializer(serializer.nodes, Object.assign({}, serializer.marks, {em: null}))
    ist(s.serializeNode(p("foo", em("bar"), strong("baz")), {document}).innerHTML,
        "foobar<strong>baz</strong>")
  })
})
