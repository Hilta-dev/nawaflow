class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.targetRate = 24000
    //sampleRate is a built-in value: the mic's real speed
    this.ratio = sampleRate / this.targetRate
    this.pos = 0
    this.buffer = []
    this.out = new Int16Array(2400)
    this.outLen = 0

    //flush part: send what is left when recording stops
    this.port.onmessage = (e) => {
      if (e.data === 'flush' && this.outLen > 0) {
        const chunk = this.out.slice(0, this.outLen)
        this.port.postMessage(chunk.buffer, [chunk.buffer])
        this.outLen = 0
      }
    }
  }

  process(inputs) {
    const input = inputs[0][0]
    if (!input) return true

    //collect new samples part
    for (let i = 0; i < input.length; i++) this.buffer.push(input[i])

    //shrink to 24 kHz part
    while (this.pos + 1 < this.buffer.length) {
      const i0 = Math.floor(this.pos)
      const frac = this.pos - i0
      const s = this.buffer[i0] * (1 - frac) + this.buffer[i0 + 1] * frac
      const clamped = Math.max(-1, Math.min(1, s))
      this.out[this.outLen++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      this.pos += this.ratio

      //send a chunk every 2400 samples (0.1 second)
      if (this.outLen === this.out.length) {
        const chunk = this.out.slice()
        this.port.postMessage(chunk.buffer, [chunk.buffer])
        this.outLen = 0
      }
    }

    //forget samples we already used
    const used = Math.floor(this.pos)
    if (used > 0) {
      this.buffer = this.buffer.slice(used)
      this.pos -= used
    }
    return true
  }
}

registerProcessor('pcm-processor', PcmProcessor)