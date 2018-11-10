import * as React from 'react'

import {
  DiagramEngine,
  DiagramModel,
  DefaultNodeModel,
  DiagramWidget,
  NodeModel
} from 'storm-react-diagrams'

import SceneEditor from './SceneEditor'
import Workspace from './Workspace'

import './Editor.css'
import './FlowChart.css'
import { StateConsumer, ApplicationState } from '../Store'
import { save } from '../persistance'

interface EditorState {
  ready: boolean
  selected: string | null
  saving: boolean
  smartRouting: boolean
}

interface EditorProps {
  state: ApplicationState
  updateState(state: Readonly<ApplicationState>): Readonly<ApplicationState>
}

class Editor extends React.Component<EditorProps, EditorState> {
  engine: DiagramEngine
  model: DiagramModel

  constructor(props: EditorProps) {
    super(props)

    this.state = {
      ready: false,
      selected: null,
      saving: false,
      smartRouting: true
    }

    this.engine = new DiagramEngine()
    this.model = new DiagramModel()

    this.engine.installDefaultFactories()

    this.model.deSerializeDiagram(this.props.state.story, this.engine)

    for (let key in this.model.nodes) {
      this.watchNode(this.model.nodes[key])
    }

    this.engine.setDiagramModel(this.model)
  }

  async componentDidMount() {
    setTimeout(() => {
      this.setState({ ready: true })

      /**
       * If smartRouting is initialized as false, toggling to true breaks
       * the flow chart engine.
       */
      this.setState({ smartRouting: false })
    }, 100)

    // Naive auto saving
    setInterval(this.saveStory, 10000)
  }

  render() {
    const { ready, saving, smartRouting } = this.state

    if (ready !== true) {
      return null
    }

    return (
      <>
        <Workspace
          onClear={this.clearSelection}
          onRelease={this.eventuallyForceUpdate}
        >
          <menu className="EditorTools">
            <button className="EditorButton" onClick={this.addScene}>
              Add scene
            </button>

            <hr className="EditorToolsDivider" />

            <button className="EditorButton" onClick={this.saveStory}>
              {saving ? 'Saving...' : 'Save'}
            </button>

            <label className="EditorButton">
              <input type="checkbox" checked={smartRouting} onChange={this.toggleRouting} /> Routing
            </label>
          </menu>
          <DiagramWidget
            diagramEngine={this.engine}
            maxNumberPointsPerLink={0}
            smartRouting={smartRouting}
          />
        </Workspace>
        <SceneEditor
          focus={this.getFocus()}
          requestPaint={this.eventuallyForceUpdate}
          onClear={this.clearSelection}
        />
      </>
    )
  }

  private clearSelection = () => {
    this.model.clearSelection()
    this.eventuallyForceUpdate()
  }

  private watchNode = (node: NodeModel) => {
    node.addListener({
      entityRemoved: () => {
        this.clearSelection()
        this.repaint()
        this.forceUpdate()
      }
    })
  }

  private getFocus(): DefaultNodeModel | null {
    const selected = this.model.getSelectedItems().filter(item => {
      return item instanceof DefaultNodeModel
    })

    if (selected.length == 1) {
      return selected[0] as DefaultNodeModel
    }

    return null
  }

  private repaint = () => this.engine.repaintCanvas()

  private eventuallyForceUpdate = () =>
    requestAnimationFrame(() => {
      this.forceUpdate()
    })

  private serialize() {
    return {
      ...this.props.state,
      story: this.model.serializeDiagram(),
    }
  }

  private addScene = () => {
    let node = new DefaultNodeModel('New Scene')

    let ids = Object.keys(this.model.nodes)

    let targetX
    let targetY

    if (ids.length) {
      let ySum = ids.reduce((acc, id) => {
        return acc + this.model.nodes[id].y
      }, 0)
      let averageY = ySum / ids.length

      let maxX = 0
      let furthestNode = this.model.nodes[ids[0]]

      ids.map((id) => {
        let existing = this.model.nodes[id]

        let rightEdge = existing.x + (existing.width || 180)
        if (rightEdge > maxX) {
          maxX = rightEdge
          furthestNode = existing
        }
      })

      targetX = maxX + 200

      if (furthestNode.y < averageY) {
        targetY = furthestNode.y + 200
      } else {
        targetY = furthestNode.y - 200
      }
    } else {
      targetX = 150
      targetY = 200
    }

    node.setPosition(targetX, targetY)

    node.addInPort('In')
    node.addOutPort('Next')

    this.watchNode(node)

    this.model.addNode(node)

    this.clearSelection()
    node.selected = true

    this.repaint()
  }

  private toFile() {
    let dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(this.serialize()))
    let anchor = document.createElement('a')

    anchor.setAttribute('href', dataStr)
    anchor.setAttribute('download', 'scene.json')
    anchor.style.position = 'absolute'

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  private loadFile(files: FileList | null) {
    if (files == null) return

    let file = files[0]
    let reader = new FileReader()

    let scope = this
    reader.onload = function () {
      try {
        scope.props.updateState(JSON.parse(`${this.result}`))
      } catch (error) {
        alert("Sorry, we couldn't parse your file :(")
      }
    }

    reader.readAsText(file)
  }

  private saveStory = async () => {
    this.setState({ saving: true })

    const then = Date.now()

    try {
      await save(this.props.state.slug, this.serialize())
    } catch (error) {
      alert(
        "Sorry! We couldn't save! It's possible you do not have internet access. Be sure to export your scene before closing the browser!"
      )
    } finally {
      let timeLeft = 400 - Math.min(Date.now() - then, 400)

      // Add a stupid delay to make it look like it really did save
      setTimeout(() => {
        this.setState({ saving: false })
      }, timeLeft)
    }
  }

  private toggleRouting = () => {
    this.setState({
      smartRouting: !this.state.smartRouting
    })
  }
}

export default () => (
  <StateConsumer>{props => <Editor {...props} />}</StateConsumer>
)
