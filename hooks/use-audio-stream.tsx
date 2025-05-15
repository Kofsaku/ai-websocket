"use client"

import { useState, useEffect, useRef } from "react"
import { getClientWebSocketUrl } from "@/lib/websocket-config"

type UseAudioStreamOptions = {
  callSid: string
  enabled?: boolean
  onError?: (error: Error) => void
}

export function useAudioStream({ callSid, enabled = true, onError }: UseAudioStreamOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const audioBufferQueueRef = useRef<ArrayBuffer[]>([])
  const isProcessingRef = useRef(false)

  // WebSocketを初期化
  useEffect(() => {
    if (!enabled || !callSid) return

    // AudioContextを初期化
    const initAudioContext = () => {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
          gainNodeRef.current = audioContextRef.current.createGain()
          gainNodeRef.current.gain.value = 1.0
          gainNodeRef.current.connect(audioContextRef.current.destination)
          console.log("AudioContext initialized")
        } catch (err) {
          const error = new Error(`Failed to initialize AudioContext: ${err}`)
          console.error(error)
          setError(error)
          onError?.(error)
        }
      }
    }

    // WebSocketを初期化
    const initWebSocket = () => {
      // Render.comのWebSocketサーバーURLを取得
      const wsUrl = getClientWebSocketUrl(callSid)

      console.log(`Connecting to WebSocket: ${wsUrl}`)

      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.binaryType = "arraybuffer"

      wsRef.current.onopen = () => {
        console.log(`WebSocket connected for call: ${callSid}`)
        setIsConnected(true)
      }

      wsRef.current.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // 音声データをキューに追加
          audioBufferQueueRef.current.push(event.data)

          // キューの処理を開始
          processAudioQueue()
        }
      }

      wsRef.current.onerror = (event) => {
        const error = new Error(`WebSocket error: ${event}`)
        console.error(error)
        setError(error)
        onError?.(error)
      }

      wsRef.current.onclose = () => {
        console.log(`WebSocket disconnected for call: ${callSid}`)
        setIsConnected(false)
      }
    }

    // 音声キューを処理
    const processAudioQueue = async () => {
      if (isProcessingRef.current || audioBufferQueueRef.current.length === 0) return

      isProcessingRef.current = true

      try {
        // AudioContextが初期化されていることを確認
        if (!audioContextRef.current) {
          initAudioContext()
        }

        // キューから音声データを取得
        const audioData = audioBufferQueueRef.current.shift()

        if (audioData && audioContextRef.current) {
          // μ-law PCMからリニアPCMに変換（簡易版）
          const pcmData = convertMuLawToPCM(new Uint8Array(audioData))

          // AudioBufferを作成
          const audioBuffer = await createAudioBuffer(pcmData)

          // 音声を再生
          playAudioBuffer(audioBuffer)

          setIsPlaying(true)
        }
      } catch (err) {
        const error = new Error(`Error processing audio queue: ${err}`)
        console.error(error)
        setError(error)
        onError?.(error)
      } finally {
        isProcessingRef.current = false

        // キューにまだデータがあれば続けて処理
        if (audioBufferQueueRef.current.length > 0) {
          processAudioQueue()
        }
      }
    }

    // μ-law PCMからリニアPCMに変換（簡易版）
    const convertMuLawToPCM = (muLawData: Uint8Array): Float32Array => {
      // 実際の実装では、より正確なμ-lawデコーディングが必要
      // ここでは簡易的な実装
      const pcmData = new Float32Array(muLawData.length)

      for (let i = 0; i < muLawData.length; i++) {
        // μ-lawの値を-1.0〜1.0の範囲に変換（簡易版）
        pcmData[i] = (muLawData[i] - 128) / 128
      }

      return pcmData
    }

    // AudioBufferを作成
    const createAudioBuffer = async (pcmData: Float32Array): Promise<AudioBuffer> => {
      if (!audioContextRef.current) {
        throw new Error("AudioContext not initialized")
      }

      // 8kHzのPCMデータを44.1kHzにアップサンプリング（簡易版）
      const sampleRate = 8000
      const targetSampleRate = audioContextRef.current.sampleRate
      const ratio = targetSampleRate / sampleRate
      const newLength = Math.floor(pcmData.length * ratio)
      const upsampled = new Float32Array(newLength)

      for (let i = 0; i < newLength; i++) {
        const originalIndex = Math.floor(i / ratio)
        upsampled[i] = pcmData[originalIndex]
      }

      // AudioBufferを作成
      const audioBuffer = audioContextRef.current.createBuffer(1, upsampled.length, targetSampleRate)
      audioBuffer.getChannelData(0).set(upsampled)

      return audioBuffer
    }

    // AudioBufferを再生
    const playAudioBuffer = (audioBuffer: AudioBuffer) => {
      if (!audioContextRef.current || !gainNodeRef.current) {
        throw new Error("AudioContext not initialized")
      }

      // 前の音声を停止
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop()
        } catch (err) {
          console.warn("Error stopping previous audio source:", err)
        }
      }

      // 新しい音声を再生
      sourceNodeRef.current = audioContextRef.current.createBufferSource()
      sourceNodeRef.current.buffer = audioBuffer
      sourceNodeRef.current.connect(gainNodeRef.current)

      sourceNodeRef.current.onended = () => {
        setIsPlaying(false)
      }

      sourceNodeRef.current.start()
    }

    // 初期化
    initAudioContext()
    initWebSocket()

    // クリーンアップ
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }

      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop()
        } catch (err) {
          console.warn("Error stopping audio source:", err)
        }
      }

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close()
        } catch (err) {
          console.warn("Error closing AudioContext:", err)
        }
      }
    }
  }, [callSid, enabled, onError])

  // 音量を設定
  const setVolume = (volume: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume))
    }
  }

  // 再生を一時停止/再開
  const togglePlayback = () => {
    if (!audioContextRef.current) return

    if (audioContextRef.current.state === "running") {
      audioContextRef.current.suspend()
      setIsPlaying(false)
    } else {
      audioContextRef.current.resume()
      setIsPlaying(true)
    }
  }

  return {
    isConnected,
    isPlaying,
    error,
    setVolume,
    togglePlayback,
  }
}
