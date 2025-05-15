// WebSocketサーバーのURLを取得する関数
export function getWebSocketServerUrl() {
  // 環境変数からWebSocketサーバーのURLを取得
  const wsServerUrl = process.env.NEXT_PUBLIC_WS_SERVER_URL || "wss://your-render-app.onrender.com"
  return wsServerUrl
}

// WebSocketサーバーのURLを取得する関数（クライアント用）
export function getClientWebSocketUrl(callSid: string) {
  const wsServerUrl = getWebSocketServerUrl()
  return `${wsServerUrl}?callSid=${callSid}`
}
