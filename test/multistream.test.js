'use strict'

const writeStream = require('flush-write-stream')
const { join } = require('path')
const { readFileSync } = require('fs')
const os = require('os')
const test = require('tap').test
const pino = require('../')
const multistream = pino.multistream
const proxyquire = require('proxyquire')
const strip = require('strip-ansi')

function testLevelProp (levelProp, t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const streams = [
    { stream: stream },
    { [levelProp]: 'debug', stream: stream },
    { [levelProp]: 'trace', stream: stream },
    { [levelProp]: 'fatal', stream: stream },
    { [levelProp]: 'silent', stream: stream }
  ]
  const log = pino({
    level: 'trace'
  }, multistream(streams))
  log.info('info stream')
  log.debug('debug stream')
  log.fatal('fatal stream')
  t.equal(messageCount, 9)
  t.end()
}

test('sends to multiple streams using string levels (back compatibility)', testLevelProp.bind({}, 'level'))

test('sends to multiple streams using string levels', testLevelProp.bind({}, 'minLevel'))

test('sends to multiple streams using optionally predefined levels', function (t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const opts = {
    levels: {
      silent: Infinity,
      fatal: 60,
      error: 50,
      warn: 50,
      info: 30,
      debug: 20,
      trace: 10
    }
  }
  const streams = [
    { stream: stream },
    { minLevel: 'trace', stream: stream },
    { minLevel: 'debug', stream: stream },
    { minLevel: 'info', stream: stream },
    { minLevel: 'warn', stream: stream },
    { minLevel: 'error', stream: stream },
    { minLevel: 'fatal', stream: stream },
    { minLevel: 'silent', stream: stream }
  ]
  const mstream = multistream(streams, opts)
  const log = pino({
    level: 'trace'
  }, mstream)
  log.trace('trace stream')
  log.debug('debug stream')
  log.info('info stream')
  log.warn('warn stream')
  log.error('error stream')
  log.fatal('fatal stream')
  log.silent('silent stream')
  t.equal(messageCount, 24)
  t.end()
})

test('sends to multiple streams using number levels', function (t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const streams = [
    { stream: stream },
    { minLevel: 20, stream: stream },
    { minLevel: 60, stream: stream }
  ]
  const log = pino({
    level: 'debug'
  }, multistream(streams))
  log.info('info stream')
  log.debug('debug stream')
  log.fatal('fatal stream')
  t.equal(messageCount, 6)
  t.end()
})

test('level include higher levels', function (t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const log = pino({}, multistream([{ minLevel: 'info', stream: stream }]))
  log.fatal('message')
  t.equal(messageCount, 1)
  t.end()
})

test('supports multiple arguments', function (t) {
  const messages = []
  const stream = writeStream(function (data, enc, cb) {
    messages.push(JSON.parse(data))
    if (messages.length === 2) {
      const msg1 = messages[0]
      t.equal(msg1.msg, 'foo bar baz foobar')

      const msg2 = messages[1]
      t.equal(msg2.msg, 'foo bar baz foobar barfoo foofoo')

      t.end()
    }
    cb()
  })
  const log = pino({}, multistream({ stream }))
  log.info('%s %s %s %s', 'foo', 'bar', 'baz', 'foobar') // apply not invoked
  log.info('%s %s %s %s %s %s', 'foo', 'bar', 'baz', 'foobar', 'barfoo', 'foofoo') // apply invoked
})

test('supports children', function (t) {
  const stream = writeStream(function (data, enc, cb) {
    const input = JSON.parse(data)
    t.equal(input.msg, 'child stream')
    t.equal(input.child, 'one')
    t.end()
    cb()
  })
  const streams = [
    { stream: stream }
  ]
  const log = pino({}, multistream(streams)).child({ child: 'one' })
  log.info('child stream')
})

test('supports grandchildren', function (t) {
  const messages = []
  const stream = writeStream(function (data, enc, cb) {
    messages.push(JSON.parse(data))
    if (messages.length === 3) {
      const msg1 = messages[0]
      t.equal(msg1.msg, 'grandchild stream')
      t.equal(msg1.child, 'one')
      t.equal(msg1.grandchild, 'two')

      const msg2 = messages[1]
      t.equal(msg2.msg, 'grandchild stream')
      t.equal(msg2.child, 'one')
      t.equal(msg2.grandchild, 'two')

      const msg3 = messages[2]
      t.equal(msg3.msg, 'debug grandchild')
      t.equal(msg3.child, 'one')
      t.equal(msg3.grandchild, 'two')

      t.end()
    }
    cb()
  })
  const streams = [
    { stream: stream },
    { minLevel: 'debug', stream: stream }
  ]
  const log = pino({
    level: 'debug'
  }, multistream(streams)).child({ child: 'one' }).child({ grandchild: 'two' })
  log.info('grandchild stream')
  log.debug('debug grandchild')
})

test('supports custom levels', function (t) {
  const stream = writeStream(function (data, enc, cb) {
    t.equal(JSON.parse(data).msg, 'bar')
    t.end()
  })
  const log = pino({
    customLevels: {
      foo: 35
    }
  }, multistream([{ minLevel: 35, stream: stream }]))
  log.foo('bar')
})

test('supports pretty print', function (t) {
  t.plan(2)
  const stream = writeStream(function (data, enc, cb) {
    t.not(strip(data.toString()).match(/INFO.*: pretty print/), null)
    cb()
  })

  const pretty = proxyquire('pino-pretty', {
    'sonic-boom': function () {
      t.pass('sonic created')
      return stream
    }
  })

  const log = pino({
    level: 'debug',
    name: 'helloName'
  }, multistream([
    { stream: pretty() }
  ]))

  log.info('pretty print')
})

test('children support custom levels', function (t) {
  const stream = writeStream(function (data, enc, cb) {
    t.equal(JSON.parse(data).msg, 'bar')
    t.end()
  })
  const parent = pino({
    customLevels: {
      foo: 35
    }
  }, multistream([{ minLevel: 35, stream: stream }]))
  const child = parent.child({ child: 'yes' })
  child.foo('bar')
})

test('levelVal ovverides level', function (t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const streams = [
    { stream: stream },
    { minLevel: 'blabla', levelVal: 15, stream: stream },
    { minLevel: 60, stream: stream }
  ]
  const log = pino({
    level: 'debug'
  }, multistream(streams))
  log.info('info stream')
  log.debug('debug stream')
  log.fatal('fatal stream')
  t.equal(messageCount, 6)
  t.end()
})

test('forwards metadata', function (t) {
  t.plan(4)
  const streams = [
    {
      stream: {
        [Symbol.for('pino.metadata')]: true,
        write (chunk) {
          t.equal(log, this.lastLogger)
          t.equal(30, this.lastLevel)
          t.same({ hello: 'world' }, this.lastObj)
          t.same('a msg', this.lastMsg)
        }
      }
    }
  ]

  const log = pino({
    level: 'debug'
  }, multistream(streams))

  log.info({ hello: 'world' }, 'a msg')
  t.end()
})

test('forward name', function (t) {
  t.plan(2)
  const streams = [
    {
      stream: {
        [Symbol.for('pino.metadata')]: true,
        write (chunk) {
          const line = JSON.parse(chunk)
          t.equal(line.name, 'helloName')
          t.equal(line.hello, 'world')
        }
      }
    }
  ]

  const log = pino({
    level: 'debug',
    name: 'helloName'
  }, multistream(streams))

  log.info({ hello: 'world' }, 'a msg')
  t.end()
})

test('forward name with child', function (t) {
  t.plan(3)
  const streams = [
    {
      stream: {
        write (chunk) {
          const line = JSON.parse(chunk)
          t.equal(line.name, 'helloName')
          t.equal(line.hello, 'world')
          t.equal(line.component, 'aComponent')
        }
      }
    }
  ]

  const log = pino({
    level: 'debug',
    name: 'helloName'
  }, multistream(streams)).child({ component: 'aComponent' })

  log.info({ hello: 'world' }, 'a msg')
  t.end()
})

test('clone generates a new multistream with all stream at the same level', function (t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const streams = [
    { stream: stream },
    { minLevel: 'debug', stream: stream },
    { minLevel: 'trace', stream: stream },
    { minLevel: 'fatal', stream: stream, maxLevel: 100 }
  ]
  const ms = multistream(streams)
  const clone = ms.clone(30)

  t.not(clone, ms)

  clone.streams.forEach((s, i) => {
    t.not(s, streams[i])
    t.equal(s.stream, streams[i].stream)
    t.equal(s.minLevel, 30)
    t.equal(s.maxLevel, streams[i].maxLevel)
  })

  const log = pino({
    level: 'trace'
  }, clone)

  log.info('info stream')
  log.debug('debug message not counted')
  log.fatal('fatal stream')
  t.equal(messageCount, 8)

  t.end()
})

test('one stream', function (t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const log = pino({
    level: 'trace'
  }, multistream({ stream, minLevel: 'fatal' }))
  log.info('info stream')
  log.debug('debug stream')
  log.fatal('fatal stream')
  t.equal(messageCount, 1)
  t.end()
})

test('dedupe', function (t) {
  let messageCount = 0
  const stream1 = writeStream(function (data, enc, cb) {
    messageCount -= 1
    cb()
  })

  const stream2 = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })

  const streams = [
    {
      stream: stream1,
      minLevel: 'info'
    },
    {
      stream: stream2,
      minLevel: 'fatal'
    }
  ]

  const log = pino({
    level: 'trace'
  }, multistream(streams, { dedupe: true }))
  log.info('info stream')
  log.fatal('fatal stream')
  log.fatal('fatal stream')
  t.equal(messageCount, 1)
  t.end()
})

test('dedupe when some streams has the same level', function (t) {
  let messageCount = 0
  const stream1 = writeStream(function (data, enc, cb) {
    messageCount -= 1
    cb()
  })

  const stream2 = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })

  const stream3 = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })

  const streams = [
    {
      stream: stream1,
      minLevel: 'info'
    },
    {
      stream: stream2,
      minLevel: 'fatal'
    },
    {
      stream: stream3,
      minLevel: 'fatal'
    }
  ]

  const log = pino({
    level: 'trace'
  }, multistream(streams, { dedupe: true }))
  log.info('info stream')
  log.fatal('fatal streams')
  log.fatal('fatal streams')
  t.equal(messageCount, 3)
  t.end()
})

test('maxLevel', function (t) {
  let messageCount = 0
  const stdout = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })

  const stderr = writeStream(function (data, enc, cb) {
    messageCount -= 1
    cb()
  })

  const streams = [
    {
      stream: stdout,
      minLevel: 'debug',
      maxLevel: 'error'
    },
    {
      stream: stderr,
      minLevel: 'error'
    }
  ]

  const log = pino({
    level: 'debug'
  }, multistream(streams))
  log.debug('stdout stream')
  log.info('stdout stream')
  log.warn('stdout stream')
  log.error('stderr stream')
  log.error('stderr stream')
  t.equal(messageCount, 1)
  t.end()
})

test('no stream', function (t) {
  const log = pino({
    level: 'trace'
  }, multistream())
  log.info('info stream')
  log.debug('debug stream')
  log.fatal('fatal stream')
  t.end()
})

test('add a stream', function (t) {
  let messageCount = 0
  const stream = writeStream(function (data, enc, cb) {
    messageCount += 1
    cb()
  })
  const log = pino({
    level: 'trace'
  }, multistream(stream))
  log.info('info stream')
  log.debug('debug stream')
  log.fatal('fatal stream')
  t.equal(messageCount, 2)
  t.end()
})

test('flushSync', function (t) {
  const tmp = join(
    os.tmpdir(),
    '_' + Math.random().toString(36).substr(2, 9)
  )
  const destination = pino.destination({ dest: tmp, sync: false, minLength: 4096 })
  const log = pino({ level: 'info' }, multistream([{ minLevel: 'info', stream: destination }]))
  destination.on('ready', () => {
    log.info('foo')
    log.info('bar')
    t.equal(readFileSync(tmp, { encoding: 'utf-8' }).split('\n').length - 1, 0)
    pino.final(log, (err, finalLogger) => {
      if (err) {
        t.fail()
        return t.end()
      }
      t.equal(readFileSync(tmp, { encoding: 'utf-8' }).split('\n').length - 1, 2)
      finalLogger.info('biz')
      t.equal(readFileSync(tmp, { encoding: 'utf-8' }).split('\n').length - 1, 3)
      t.end()
    })()
  })
})

test('ends all streams', function (t) {
  t.plan(7)
  const stream = writeStream(function (data, enc, cb) {
    t.pass('message')
    cb()
  })
  stream.flushSync = function () {
    t.pass('flushSync')
  }
  // stream2 has no flushSync
  const stream2 = writeStream(function (data, enc, cb) {
    t.pass('message2')
    cb()
  })
  const streams = [
    { stream: stream },
    { minLevel: 'debug', stream: stream },
    { minLevel: 'trace', stream: stream2 },
    { minLevel: 'fatal', stream: stream },
    { minLevel: 'silent', stream: stream }
  ]
  const multi = multistream(streams)
  const log = pino({
    level: 'trace'
  }, multi)
  log.info('info stream')
  multi.end()
})
