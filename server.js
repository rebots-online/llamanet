const fetch = require('cross-fetch')
const path = require('path')
const proxy = require('express-http-proxy-cp');
const SSEChannel = require('sse-pubsub');
const express = require('express')
const llamacpp = require('./llamacpp')
const constants = require('./constants')
const Handler = require('./handler')
const util = require('./util')
class Server {
  constructor () {
    this.port = constants.port
    this.handler = new Handler()
    this.channel = new SSEChannel();
  }
  async call(argv) {
    const url = `http://localhost:${this.port}/call`
    const response = await fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(argv)
    }).then((res) => {
      return res.json()
    })
    return response
  }
  async start() {

    // if the server app already exists, return
    if (this.app) {
      return
    }

    // if the server port is running, return
    const available = await util.checkPort(this.port)
    if (!available) {
      return
    }

    // check if the port is occupied. if occupied, don't start

    const app = express()
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/v1', proxy(async (req) => {
      // host handling
      if (req.body.model) {

        // check if exists
        let found = this.handler.find({ url: req.body.model })
        if (!found) {
          //// check to see if the model exists
          //const models = await llamacpp.models()    

          //let found_models = models.data.filter((model) => {
          //  return model.id === req.body.model
          //})
          //let model_found = found_models.length > 0

          //// if it exists, start,
          //// otherwise,
          ////  if it starts with http, start
          ////
          //// otherwise use the default model
          //let model = (model_found ? req.body.model : this.handler.default_model)

          const model = req.body.model
          let response = await this.handler.call({ _: ["start", model] }, (event) => {
//          process.stdout.write(event.data)
          })

          // update the request body.model
          req.body.model = response.url
        }

        // route to llamacpp servers
        found = this.handler.find({ url: req.body.model })
        const u = `http://127.0.0.1:${found.proc.port}`   // 127.0.0.1 works but localhost doesn't work
        return u
      } else {
        // route to self
        return `http://localhost:${this.port}`
      }
    }, {
      proxyReqBodyDecorator: (bodyContent, srcReq) => {
        const bodyStr = JSON.stringify(srcReq.body)
        return bodyStr
      },
      proxyReqPathResolver: (req) => {
        if (req.body.model) {
          return req.originalUrl
        } else {
          return req.url
        }
      }
    }))

    app.set('view engine', 'ejs');
    app.set("views", path.resolve(__dirname, "views"))
    app.use(express.static(path.join(__dirname, 'public')))
    app.get('/', async (req, res) => {
      res.render("index", {
        llama_port: this.port
      })
    })
    app.get('/stream', (req, res) => this.channel.subscribe(req, res));
    app.post("/call", async (req, res) => {
      const response = await this.handler.call(req.body, (event) => {
        this.channel.publish(JSON.stringify(event), "term")
//        if (event.data) {
//          process.stdout.write(event.data)
//        }
      })
      res.json({ response })
    })
    app.get("/models", async (req, res) => {
      const models = await llamacpp.models()    
      res.json(models)
    })
    app.get("/query/:type", async (req, res) => {
      if (req.params.type === "models") {
        const models = await llamacpp.models()    
        res.json({ response: models })
      } else if (req.params.type === "status") {
        let status = await this.handler.status()
        res.json({ response: status })
      }
    })

    app.listen(this.port, async () => {
      await util.log(`llamanet running at http://localhost:${this.port}`)
      //console.log(`\nllamanet running at http://localhost:${this.port}\n`)
    })
    this.app = app




    process.on("beforeExit", async (code) => {
      await this.handler.kill()
      process.exit()
    });
    process.on("exit", async (code) => {
      await this.handler.kill()
      process.exit()
    });
    process.on("SIGTERM", async (signal) => {
      await this.handler.kill()
      process.exit()
    });
    process.on("SIGINT", async (signal) => {
      await this.handler.kill()
      process.exit()
    });
    process.on("SIGHUB", async (signal) => {
      await this.handler.kill()
      process.exit()
    });
    process.on("SIGQUIT", async (signal) => {
      await this.handler.kill()
      process.exit()
    })
//    process.on("uncaughtException", async (err) => {
//      console.log("err", err)
//      await this.handler.kill()
//    });


  }
}
module.exports = Server
