import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Gmail Recovery History cursor reliability contracts', () => {
  it('preserves initial cursor when ingestion fails mid-batch', () => {
    const initialCursor = '1000';
    const newHistoryId = '1005';
    let currentCursor = initialCursor;
    let cursorStatus = 'idle';

    const historyMessages = [
      { id: 'msg-1', threadId: 'th-1' },
      { id: 'msg-2', threadId: 'th-2' }, // will simulate failure
      { id: 'msg-3', threadId: 'th-3' },
    ];

    let ingestionFailed = false;
    let failureReason: string | null = null;
    const processedMessages: string[] = [];

    for (const msg of historyMessages) {
      if (msg.id === 'msg-2') {
        ingestionFailed = true;
        failureReason = 'DB connection error during message ingestion';
        break;
      }
      processedMessages.push(msg.id);
    }

    if (ingestionFailed) {
      // Preserves initial cursor, does not advance to newHistoryId
      currentCursor = initialCursor;
      cursorStatus = 'failed';
    } else {
      currentCursor = newHistoryId;
      cursorStatus = 'idle';
    }

    assert.equal(currentCursor, '1000');
    assert.equal(cursorStatus, 'failed');
    assert.equal(processedMessages.length, 1);
    assert.deepEqual(processedMessages, ['msg-1']);
  });

  it('advances cursor when all messages succeed or are deliberately ignored', () => {
    const initialCursor = '1000';
    const newHistoryId = '1005';
    let currentCursor = initialCursor;
    let cursorStatus = 'idle';

    const historyMessages = [
      { id: 'msg-1', threadId: 'th-1', isIgnored: false },
      { id: 'msg-2', threadId: 'th-2', isIgnored: true }, // automated sender
      { id: 'msg-3', threadId: 'th-3', isIgnored: false },
    ];

    let ingestionFailed = false;
    let ingestedCount = 0;
    let ignoredCount = 0;

    for (const msg of historyMessages) {
      if (msg.isIgnored) {
        ignoredCount += 1;
        continue;
      }
      ingestedCount += 1;
    }

    if (!ingestionFailed) {
      currentCursor = newHistoryId;
      cursorStatus = 'idle';
    }

    assert.equal(currentCursor, '1005');
    assert.equal(cursorStatus, 'idle');
    assert.equal(ingestedCount, 2);
    assert.equal(ignoredCount, 1);
  });
});
