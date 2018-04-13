const ist = require("ist")
const {DOMParser, DOMSerializer, Schema} = require("../dist")

// declare global: window
let document = typeof window == "undefined" ? (new (require("jsdom").JSDOM)).window.document : window.document

const schema = new Schema({
  marks: {
    comment: {
      attrs: {
        id: {
          default: 0
        },
        inline: {
          default: true
        }
      },
      parseDOM: [{
          tag: "span.comment",
          getAttrs(dom) {
            return {
              id: parseInt(dom.dataset.id),
              inline: true
            }
          }
        },
        {
          tag: "div.comment",
          getAttrs(dom) {
            return {
              id: parseInt(dom.dataset.id),
              inline: false
            }
          }
        }
      ],
      toDOM(node) {
        let elType = node.attrs.inline ? 'span' : 'div'
        return [elType, {
          'data-id': node.attrs.id
        }]
      }
    }
  },
  nodes: {
    doc: {
      content: "block+",
      marks: "comment"
    },
    paragraph: {
      content: "inline*",
      group: "block"
    },
    text: {
      group: "inline"
    }
  }
})

const parser = DOMParser.fromSchema(schema)
const serializer = DOMSerializer.fromSchema(schema)

describe("BlockMarks", () => {
  describe("parse", () => {
    function domFrom(html) {
      let dom = document.createElement("div")
      dom.innerHTML = html
      return dom
    }

    function test(html, json) {
      return () => {
        let doc = schema.nodeFromJSON(json)
        let derivedDOM = document.createElement("div")
        derivedDOM.appendChild(serializer.serializeFragment(doc.content, {document}))
        let declaredDOM = domFrom(html)

        ist(derivedDOM.innerHTML, declaredDOM.innerHTML)
        ist(parser.parse(derivedDOM).toJSON(), json, eq)
      }
    }

    it("can represent a mark on a block with no mark on contained text",
      test(
        "<p>This paragraph has no marks.</p><div class='comment' data-id='234'><p>This paragraph has a mark.</p></div>",
        {
          "type": "doc",
          "content": [{
            "type": "paragraph",
            "content": [{
              "type": "text",
              "text": "This paragraph has no marks."
            }]
          }, {
            "type": "paragraph",
            "content": [{
              "type": "text",
              "text": "This paragraph has a mark."
            }],
            "marks": [{
              "type": "comment",
              "attrs": {
                "id": 234
              }
            }]
          }]
        }
      )
    )

    it("can represent a mark on a block with the same mark on contained text",
      test(
        "<p>This paragraph has no marks.</p><div class='comment' data-id='234'><p>This <span class='comment' data-id='234'>paragraph</span> has a mark.</p></div>",
        {
          "type": "doc",
          "content": [{
            "type": "paragraph",
            "content": [{
              "type": "text",
              "text": "This paragraph has no marks."
            }]
          }, {
            "type": "paragraph",
            "content": [{
              "type": "text",
              "text": "This "
            }, {
              "type": "text",
              "text": "paragraph",
              "marks": [{
                "type": "comment",
                "attrs": {
                  "id": 234
                }
              }]
          }, {
            "type": "text",
            "text": " has a mark."
          }],
            "marks": [{
              "type": "comment",
              "attrs": {
                "id": 234
              }
            }]
          }]
        }
      )
    )

    it("can represent a mark on a block with the same mark on contained text with an attribute difference",
      test(
        "<p>This paragraph has no marks.</p><div class='comment' data-id='234'><p>This <span class='comment' data-id='235'>paragraph</span> has a mark.</p></div>",
        {
          "type": "doc",
          "content": [{
            "type": "paragraph",
            "content": [{
              "type": "text",
              "text": "This paragraph has no marks."
            }]
          }, {
            "type": "paragraph",
            "content": [{
              "type": "text",
              "text": "This "
            }, {
              "type": "text",
              "text": "paragraph",
              "marks": [{
                "type": "comment",
                "attrs": {
                  "id": 235
                }
              }]
          }, {
            "type": "text",
            "text": " has a mark."
          }],
            "marks": [{
              "type": "comment",
              "attrs": {
                "id": 234
              }
            }]
          }]
        }
      )
    )

  })

})
