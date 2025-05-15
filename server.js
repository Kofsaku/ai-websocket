const http = require("http")
const WebSocket = require("ws")
const cors = require("cors")
const express = require("express")

// 環境変数からポート番号を取得
const PORT = process.env.PORT || 3001

// Expressアプリケーションを作成
const app = express()

// CORSを設定（Vercelデプロイのドメインを許可）
app.use(
  cors({
    origin: process.env.VERCEL_URL || "https://v0-twilio-ai-call-system.vercel.app/",
    methods: ["GET", "POST"],
    credentials: true,
  }),
)

// ヘルスチェック用のエンドポイント
app.get("/health", (req, res) => {
  res.status(200).send("WebSocket Server is running")
})

// HTTPサーバーを作成
const server = http.createServer(app)

// WebSocketサーバーを作成
const wss = new WebSocket.Server({ server })

// 音声ストリーム用のクライアントマップ
const audioClients = new Map()

// WebSocketの接続を処理
wss.on("connection", (ws, req) => {
  // URLからcallSidを取得
  const url = new URL(req.url, `http://${req.headers.host}`)
  const callSid = url.searchParams.get("callSid") || "unknown"
  const userAgent = req.headers["user-agent"] || "unknown"

  console.log(`✅ WS CONNECT callSid=${callSid}, userAgent=${userAgent}`)

  console.log(`WebSocket connection established for call: ${callSid}`)

  // Twilioからの接続かどうかを判断
  const isTwilio = req.headers["user-agent"] && req.headers["user-agent"].includes("Twilio")

  if (isTwilio) {
    console.log(`Twilio Media Stream connected for call: ${callSid}`)

    // Twilioからのメッセージを処理
    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString())

        // 音声データの場合
        if (msg.event === "media" && msg.media && msg.media.payload) {
          const payload = Buffer.from(msg.media.payload, "base64")

          // この通話のクライアントに音声データを送信
          const clients = audioClients.get(callSid)
          if (clients) {
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(payload)
              }
            })
          }
        }
      } catch (error) {
        console.error("Error processing Twilio media message:", error)
      }
    })
  } else {
    console.log(`Browser client connected for call: ${callSid}`)

    // この通話のクライアントリストに追加
    if (!audioClients.has(callSid)) {
      audioClients.set(callSid, new Set())
    }
    audioClients.get(callSid).add(ws)
  }

  // 接続終了時の処理
  ws.on("close", () => {
    console.log(`WebSocket disconnected for call: ${callSid}`)
    if (!isTwilio) {
      const clients = audioClients.get(callSid)
      if (clients) {
        clients.delete(ws)
        if (clients.size === 0) {
          audioClients.delete(callSid)
        }
      }
    }
  })
})

// サーバーを起動
server.listen(PORT, () => {
  console.log(`WebSocket Server running on port ${PORT}`)
})
