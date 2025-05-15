import { createTwiMLResponse, getWebhookBaseUrl } from "@/lib/twilio"
import { addTranscript } from "@/lib/websocket-server"
import { getInitialSystemPrompt } from "@/lib/ai"
import { getWebSocketServerUrl } from "@/lib/websocket-config"

export async function POST(request: Request) {
  try {
    console.log("API twilio/voice: Request received")
    console.log("Webhook base URL:", getWebhookBaseUrl())

    // フォームデータを取得
    const formData = await request.formData()
    console.log("Form data received:", Object.fromEntries(formData.entries()))

    const callSid = formData.get("CallSid") as string
    const baseUrl = getWebhookBaseUrl()

    console.log(`API twilio/voice: Generating TwiML for call ${callSid}`)

    if (!callSid) {
      console.warn("CallSid is missing in request, generating simple TwiML")
      // CallSidがない場合でも基本的なTwiMLを返す
      const simpleTwiml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say language="ja-JP" voice="Polly.Mizuki">
          こんにちは、AIコールシステムです。担当者様はいらっしゃいますか？
        </Say>
        <Gather input="speech" action="${baseUrl}/api/twiml/handle-gather" language="ja-JP" timeout="5"/>
      </Response>
    `

      console.log("Generated simple TwiML:", simpleTwiml)
      return createTwiMLResponse(simpleTwiml)
    }

    try {
      // 初期システムプロンプトをトランスクリプトに追加
      const systemPrompt = getInitialSystemPrompt()
      addTranscript(callSid, "system", systemPrompt)

      // 初期AIメッセージをトランスクリプトに追加
      // ランダムな挨拶メッセージを使用
      const greetings = [
        "こんにちは、AIコールシステムです。担当者様はいらっしゃいますか？",
        "お電話ありがとうございます。AIコールシステムです。担当者の方はいらっしゃいますか？",
        "AIコールシステムからお電話しております。担当者様はいらっしゃいますでしょうか？",
        "お世話になっております。AIコールシステムです。担当者様をお願いできますか？",
      ]
      const initialMessage = greetings[Math.floor(Math.random() * greetings.length)]

      addTranscript(callSid, "assistant", initialMessage)
      console.log(`[TRANSCRIPT] AI: ${initialMessage}`)
    } catch (transcriptError) {
      console.error("Error adding transcript:", transcriptError)
      // トランスクリプトの追加に失敗しても続行
    }

    // WebSocketサーバーのURLを取得
    const wsServerUrl = getWebSocketServerUrl()

    // Media Streamsを有効にしたTwiMLを生成
    const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Start>
        <Stream url="${wsServerUrl}" />
      </Start>
      <Say language="ja-JP" voice="Polly.Mizuki">
        こんにちは、AIコールシステムです。担当者様はいらっしゃいますか？
      </Say>
      <Gather input="speech" action="${baseUrl}/api/twiml/handle-gather?CallSid=${callSid}" language="ja-JP" timeout="5"/>
    </Response>
  `

    console.log("Generated TwiML with Media Streams:", twiml)
    return createTwiMLResponse(twiml)
  } catch (error) {
    console.error("Error generating TwiML:", error)

    // Fallback TwiML in case of error
    const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say language="ja-JP" voice="Polly.Mizuki">
        こんにちは、AIコールシステムです。担当者様はいらっしゃいますか？
      </Say>
      <Gather input="speech" action="${getWebhookBaseUrl()}/api/twiml/handle-gather" language="ja-JP" timeout="5"/>
    </Response>
  `

    return createTwiMLResponse(twiml)
  }
}
