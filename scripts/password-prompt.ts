/** Read a password without terminal echo or command-line arguments. */
export async function readPassword(prompt = 'Kata sandi (12–128 karakter, tidak ditampilkan): ') {
  if (!process.stdin.isTTY) throw new Error('Variabel password diperlukan pada mode non-interaktif')
  process.stdout.write(prompt)
  return new Promise<string>((resolve, reject) => {
    let value = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') {
          cleanup()
          reject(new Error('Dibatalkan'))
          return
        }
        if (char === '\r' || char === '\n') {
          cleanup()
          resolve(value)
          return
        }
        if (char === '\u007f') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    function cleanup() {
      process.stdin.setRawMode(false)
      process.stdin.off('data', onData)
      process.stdin.pause()
      process.stdout.write('\n')
    }
    process.stdin.on('data', onData)
  })
}
