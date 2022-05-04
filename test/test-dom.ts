import {schema, eq, doc, blockquote, pre, h1, h2, p, li, ol, ul, em, strong, code, a, br, img, hr,
        builders} from "prosemirror-test-builder"
import ist from "ist"
import {DOMParser, DOMSerializer, Slice, Fragment, Schema, Node as PMNode, Mark,
        ParseOptions, ParseRule} from "prosemirror-model"

// @ts-ignore
import {JSDOM} from "jsdom"
const document = new JSDOM().window.document
const xmlDocument = new JSDOM("<tag/>", {contentType: "application/xml"}).window.document

const parser = DOMParser.fromSchema(schema)
const serializer = DOMSerializer.fromSchema(schema)

describe("DOMParser", () => {
  describe("parse", () => {
    function domFrom(html: string, document_ = document) {
      let dom = document_.createElement("div")
      dom.innerHTML = html
      return dom
    }

    function test(doc: PMNode, html: string, document_ = document) {
      return () => {
        let derivedDOM = document_.createElement("div"), schema = doc.type.schema
        derivedDOM.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {document: document_}))
        let declaredDOM = domFrom(html, document_)

        ist(derivedDOM.innerHTML, declaredDOM.innerHTML)
        ist(DOMParser.fromSchema(schema).parse(derivedDOM), doc, eq)
      }
    }

    it("can represent simple node",
       test(doc(p("hello")),
            "<p>hello</p>"))

    it("can represent a line break",
       test(doc(p("hi", br(), "there")),
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
       test(doc(p(em("hi", br(), "x"))),
            "<p><em>hi<br>x</em></p>"))

    it("doesn't collapse non-breaking spaces",
       test(doc(p("\u00a0 \u00a0hello\u00a0")),
            "<p>\u00a0 \u00a0hello\u00a0</p>"))

    it("can parse marks on block nodes", () => {
      let commentSchema = new Schema({
        nodes: schema.spec.nodes.update("doc", Object.assign({marks: "comment"}, schema.spec.nodes.get("doc"))),
        marks: schema.spec.marks.update("comment", {
          parseDOM: [{tag: "div.comment"}],
          toDOM() { return ["div", {class: "comment"}, 0] }
        })
      })
      let b = builders(commentSchema) as any
      test(b.doc(b.paragraph("one"), b.comment(b.paragraph("two"), b.paragraph(b.strong("three"))), b.paragraph("four")),
           "<p>one</p><div class=\"comment\"><p>two</p><p><strong>three</strong></p></div><p>four</p>")()
    })

    it("parses unique, non-exclusive, same-typed marks", () => {
      let commentSchema = new Schema({
        nodes: schema.spec.nodes,
        marks: schema.spec.marks.update("comment", {
          attrs: { id: { default: null }},
          parseDOM: [{
            tag: "span.comment",
            getAttrs(dom) { return { id: parseInt((dom as HTMLElement).getAttribute('data-id')!, 10) } }
          }],
          excludes: '',
          toDOM(mark: Mark) { return ["span", {class: "comment", "data-id": mark.attrs.id }, 0] }
        })
      })
      let b = builders(commentSchema)
      test(b.schema.nodes.doc.createAndFill(undefined, [
        b.schema.nodes.paragraph.createAndFill(undefined, [
          b.schema.text('double comment', [
            b.schema.marks.comment.create({ id: 1 }),
            b.schema.marks.comment.create({ id: 2 })
          ])!
        ])!
      ])!,
           "<p><span class=\"comment\" data-id=\"1\"><span class=\"comment\" data-id=\"2\">double comment</span></span></p>")()
    })

    it("serializes non-spanning marks correctly", () => {
      let markSchema = new Schema({
        nodes: schema.spec.nodes,
        marks: schema.spec.marks.update("test", {
          parseDOM: [{tag: "test"}],
          toDOM() { return ["test", 0] },
          spanning: false
        })
      })
      let b = builders(markSchema) as any
      test(b.doc(b.paragraph(b.test("a", b.image({src: "x"}), "b"))),
           "<p><test>a</test><test><img src=\"x\"></test><test>b</test></p>")()
    })

    it("serializes an element and an attribute with XML namespace", () => {
      let xmlnsSchema = new Schema({
        nodes: {
          doc: { content: "svg*" }, text: {},
          "svg": {
            parseDOM: [{tag: "svg", namespace: 'http://www.w3.org/2000/svg'}],
            group: 'block',
            toDOM() { return ["http://www.w3.org/2000/svg svg", ["use", { "http://www.w3.org/1999/xlink href": "#svg-id" }]] },
          },
        },
      })

      let b = builders(xmlnsSchema) as any
      let d = b.doc(b.svg())
      test(d, "<svg><use href=\"#svg-id\"></use></svg>", xmlDocument)()

      let dom = xmlDocument.createElement('div')
      dom.appendChild(DOMSerializer.fromSchema(xmlnsSchema).serializeFragment(d.content, {document: xmlDocument}))
      ist(dom.querySelector('svg').namespaceURI, 'http://www.w3.org/2000/svg')
      ist(dom.querySelector('use').namespaceURI, 'http://www.w3.org/2000/svg')
      ist(dom.querySelector('use').attributes[0].namespaceURI, 'http://www.w3.org/1999/xlink')
    })

    function recover(html: string, doc: PMNode, options?: ParseOptions) {
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

    it("removes whitespace after a hard break",
       recover("<p>hello<br>\n  world</p>",
               doc(p("hello", br(), "world"))))

    it("converts br nodes to newlines when they would otherwise be ignored",
       recover("<pre>foo<br>bar</pre>",
               doc(pre("foo\nbar"))))

    it("finds a valid place for invalid content",
       recover("<ul><li>hi</li><p>whoah</p><li>again</li></ul>",
               doc(ul(li(p("hi")), li(p("whoah")), li(p("again"))))))

    it("moves nodes up when they don't fit the current context",
       recover("<div>hello<hr/>bye</div>",
               doc(p("hello"), hr(), p("bye"))))

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

    it("interprets font-style: italic as em",
       recover("<p><span style='font-style: italic'>Hello</span>!</p>",
               doc(p(em("Hello"), "!"))))

    it("interprets font-weight: bold as strong",
       recover("<p style='font-weight: bold'>Hello</p>",
               doc(p(strong("Hello")))))

    it("ignores unknown inline tags",
       recover("<p><u>a</u>bc</p>",
               doc(p("abc"))))

    it("can add marks specified before their parent node is opened",
       recover("<em>hi</em> you",
               doc(p(em("hi"), " you"))))

    it("keeps applying a mark for the all of the node's content",
       recover("<p><strong><span>xx</span>bar</strong></p>",
               doc(p(strong("xxbar")))))

    it("doesn't ignore whitespace-only nodes in preserveWhitespace full mode",
       recover("<span> </span>x", doc(p(" x")), {preserveWhitespace: "full"}))

    function parse(html: string, options: ParseOptions, doc: PMNode) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let result = parser.parse(dom, options)
        ist(result, doc, eq)
      }
    }

    it("accepts the topNode option",
       parse("<li>wow</li><li>such</li>", {topNode: schema.nodes.bullet_list.createAndFill()!},
             ul(li(p("wow")), li(p("such")))))

    let item = schema.nodes.list_item.createAndFill()!
    it("accepts the topMatch option",
       parse("<ul><li>x</li></ul>", {topNode: item, topMatch: item.contentMatchAt(1)!},
             li(ul(li(p("x"))))))

    it("accepts from and to options",
       parse("<hr><p>foo</p><p>bar</p><img>", {from: 1, to: 3},
             doc(p("foo"), p("bar"))))

    it("accepts the preserveWhitespace option",
       parse("foo   bar", {preserveWhitespace: true},
             doc(p("foo   bar"))))

    function open(html: string, nodes: (string | PMNode)[], openStart: number, openEnd: number, options?: ParseOptions) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let result = parser.parseSlice(dom, options)
        ist(result, new Slice(Fragment.from(nodes.map(n => typeof n == "string" ? schema.text(n) : n)), openStart, openEnd), eq)
      }
    }

    it("can parse an open slice",
       open("foo", ["foo"], 0, 0))

    it("will accept weird siblings",
       open("foo<p>bar</p>", ["foo", p("bar")], 0, 1))

    it("will open all the way to the inner nodes",
       open("<ul><li>foo</li><li>bar<br></li></ul>", [ul(li(p("foo")), li(p("bar", br())))], 3, 3))

    it("accepts content open to the left",
       open("<li><ul><li>a</li></ul></li>", [li(ul(li(p("a"))))], 4, 4))

    it("accepts content open to the right",
       open("<li>foo</li><li></li>", [li(p("foo")), li()], 2, 1))

    it("will create textblocks for block nodes",
       open("<div><div>foo</div><div>bar</div></div>", [p("foo"), p("bar")], 1, 1))

    it("can parse marks at the start of defaulted textblocks",
       open("<div>foo</div><div><em>bar</em></div>",
            [p("foo"), p(em("bar"))], 1, 1))

    it("will not apply invalid marks to nodes",
       open("<ul style='font-weight: bold'><li>foo</li></ul>", [ul(li(p(strong("foo"))))], 3, 3))

    it("will apply pending marks from parents to all children",
       open("<ul style='font-weight: bold'><li>foo</li><li>bar</li></ul>", [ul(li(p(strong("foo"))), li(p(strong("bar"))))], 3, 3))

    it("can parse nested mark with same type",
       open("<p style='font-weight: bold'>foo<strong style='font-weight: bold;'>bar</strong>baz</p>",
           [p(strong("foobarbaz"))], 1, 1))

    it("drops block-level whitespace",
       open("<div> </div>", [], 0, 0, {preserveWhitespace: true}))

    it("keeps whitespace in inline elements",
       open("<b> </b>", [p(strong(" ")).child(0)], 0, 0, {preserveWhitespace: true}))

    it("can parse nested mark with same type but different attrs", () => {
      let markSchema = new Schema({
        nodes: schema.spec.nodes,
        marks: schema.spec.marks.update("s", {
          attrs: {
            'data-s': { default: 'tag' }
          },
          excludes: '',
          parseDOM: [{
            tag: "s",
          }, {
            style: "text-decoration",
            getAttrs() {
              return {
                'data-s': 'style'
              }
          }
          }]
        })
      })
      let b = builders(markSchema)
      let dom = document.createElement("div")
      dom.innerHTML = "<p style='text-decoration: line-through;'>o<s style='text-decoration: line-through;'>o</s>o</p>"
      let result = DOMParser.fromSchema(markSchema).parseSlice(dom)
      ist(result, new Slice(Fragment.from(
        b.schema.nodes.paragraph.create(
          undefined,
          [
            b.schema.text('o', [b.schema.marks.s.create({ 'data-s': 'style' })]),
            b.schema.text('o', [b.schema.marks.s.create({ 'data-s': 'style' }), b.schema.marks.s.create({ 'data-s': 'tag' })]),
            b.schema.text('o', [b.schema.marks.s.create({ 'data-s': 'style' })])
          ]
        )
      ), 1, 1), eq)

      dom.innerHTML = "<p><span style='text-decoration: line-through;'><s style='text-decoration: line-through;'>o</s>o</span>o</p>"
      result = DOMParser.fromSchema(markSchema).parseSlice(dom)
      ist(result, new Slice(Fragment.from(
        b.schema.nodes.paragraph.create(
          undefined,
          [
            b.schema.text('o', [b.schema.marks.s.create({ 'data-s': 'style' }), b.schema.marks.s.create({ 'data-s': 'tag' })]),
            b.schema.text('o', [b.schema.marks.s.create({ 'data-s': 'style' })]),
            b.schema.text('o')
          ]
        )
      ), 1, 1), eq)
    })

    function find(html: string, doc: PMNode) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let tag = dom.querySelector("var"), prev = tag.previousSibling!, next = tag.nextSibling, pos
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
        ist((pos as any).pos, (doc as any).tag.a)
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

    function contextParser(context: string) {
      return new DOMParser(schema, [{tag: "foo", node: "horizontal_rule", context} as ParseRule]
                                     .concat(DOMParser.schemaRules(schema) as ParseRule[]))
    }

    it("recognizes context restrictions", () => {
      ist(contextParser("blockquote/").parse(domFrom("<foo></foo><blockquote><foo></foo><p><foo></foo></p></blockquote>")),
          doc(blockquote(hr(), p())), eq)
    })

    it("accepts group names in contexts", () => {
      ist(contextParser("block/").parse(domFrom("<foo></foo><blockquote><foo></foo><p></p></blockquote>")),
          doc(blockquote(hr(), p())), eq)
    })

    it("understands nested context restrictions", () => {
      ist(contextParser("blockquote/ordered_list//")
          .parse(domFrom("<foo></foo><blockquote><foo></foo><ol><li><p>a</p><foo></foo></li></ol></blockquote>")),
          doc(blockquote(ol(li(p("a"), hr())))), eq)
    })

    it("understands double slashes in context restrictions", () => {
      ist(contextParser("blockquote//list_item/")
          .parse(domFrom("<foo></foo><blockquote><foo></foo><ol><foo></foo><li><p>a</p><foo></foo></li></ol></blockquote>")),
          doc(blockquote(ol(li(p("a"), hr())))), eq)
    })

    it("understands pipes in context restrictions", () => {
      ist(contextParser("list_item/|blockquote/")
          .parse(domFrom("<foo></foo><blockquote><p></p><foo></foo></blockquote><ol><li><p>a</p><foo></foo></li></ol>")),
          doc(blockquote(p(), hr()), ol(li(p("a"), hr()))), eq)
    })

    it("uses the passed context", () => {
      let cxDoc = doc(blockquote("<a>", hr()))
      ist(contextParser("doc//blockquote/").parse(domFrom("<blockquote><foo></foo></blockquote>"), {
        topNode: blockquote(),
        context: cxDoc.resolve((cxDoc as any).tag.a)
      }), blockquote(blockquote(hr())), eq)
    })

    it("uses the passed context when parsing a slice", () => {
      let cxDoc = doc(blockquote("<a>", hr()))
      ist(contextParser("doc//blockquote/").parseSlice(domFrom("<foo></foo>"), {
        context: cxDoc.resolve((cxDoc as any).tag.a)
      }), new Slice(blockquote(hr()).content, 0, 0), eq)
    })

    it("can close parent nodes from a rule", () => {
      let closeParser = new DOMParser(schema, [{tag: "br", closeParent: true} as ParseRule]
                                                .concat(DOMParser.schemaRules(schema)))
      ist(closeParser.parse(domFrom("<p>one<br>two</p>")), doc(p("one"), p("two")), eq)
    })

    it("supports non-consuming node rules", () => {
      let parser = new DOMParser(schema, [{tag: "ol", consuming: false, node: "blockquote"} as ParseRule]
                                 .concat(DOMParser.schemaRules(schema)))
      ist(parser.parse(domFrom("<ol><p>one</p></ol>")), doc(blockquote(ol(li(p("one"))))), eq)
    })

    it("supports non-consuming style rules", () => {
      let parser = new DOMParser(schema, [{style: "font-weight", consuming: false, mark: "em"} as ParseRule]
                                 .concat(DOMParser.schemaRules(schema)))
      ist(parser.parse(domFrom("<p><span style='font-weight: 800'>one</span></p>")), doc(p(em(strong("one")))), eq)
    })

    it("doesn't get confused by nested mark tags",
       recover("<div><strong><strong>A</strong></strong>B</div><span>C</span>",
               doc(p(strong("A"), "B"), p("C"))))
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

    function nsParse(doc: Node, namespace?: string) {
      let schema = new Schema({
        nodes: {doc: {content: "h*"}, text: {},
                h: {parseDOM: [{tag: "h", namespace}]}}
      })
      return DOMParser.fromSchema(schema).parse(doc)
    }

    it("includes nodes when namespace is correct", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:ns", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "urn:ns").childCount, 1)
    })

    it("excludes nodes when namespace is wrong", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:nt", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "urn:ns").childCount, 0)
    })

    it("excludes nodes when namespace is absent", () => {
      let doc = xmlDocument.createElement("doc")
      // in HTML documents, createElement gives namespace
      // 'http://www.w3.org/1999/xhtml' so use createElementNS
      let h = xmlDocument.createElementNS(null, "h")
      doc.appendChild(h)
      ist(nsParse(doc, "urn:ns").childCount, 0)
    })

    it("excludes nodes when namespace is wrong and xhtml", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:nt", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "http://www.w3.org/1999/xhtml").childCount, 0)
    })

    it("excludes nodes when namespace is wrong and empty", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:nt", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "").childCount, 0)
    })

    it("includes nodes when namespace is correct and empty", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS(null, "h")
      doc.appendChild(h)
      ist(nsParse(doc).childCount, 1)
    })
  })
})

describe("DOMSerializer", () => {
  let noEm = new DOMSerializer(serializer.nodes, Object.assign({}, serializer.marks, {em: null}))

  it("can omit a mark", () => {
    ist((noEm.serializeNode(p("foo", em("bar"), strong("baz")), {document}) as HTMLElement).innerHTML,
        "foobar<strong>baz</strong>")
  })

  it("doesn't split other marks for omitted marks", () => {
    ist((noEm.serializeNode(p("foo", code("bar"), em(code("baz"), "quux"), "xyz"), {document}) as HTMLElement).innerHTML,
        "foo<code>barbaz</code>quuxxyz")
  })

  it("can render marks with complex structure", () => {
    let deepEm = new DOMSerializer(serializer.nodes, Object.assign({}, serializer.marks, {
      em() { return ["em", ["i", {"data-emphasis": true}, 0]] }
    }))
    let node = deepEm.serializeNode(p(strong("foo", code("bar"), em(code("baz"))), em("quux"), "xyz"), {document})
    ist((node as HTMLElement).innerHTML,
        "<strong>foo<code>bar</code></strong><em><i data-emphasis=\"true\"><strong><code>baz</code></strong>quux</i></em>xyz")
  })
})
