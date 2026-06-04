import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCenteredSquareCrop, dataUrlToBase64 } from '../src/lib/avatarCrop.ts';

test('buildCenteredSquareCrop 取短边并在横向图上水平居中', () => {
  assert.deepEqual(buildCenteredSquareCrop(800, 600), { x: 100, y: 0, width: 600, height: 600 });
});

test('buildCenteredSquareCrop 在纵向图上垂直居中', () => {
  assert.deepEqual(buildCenteredSquareCrop(400, 1000), { x: 0, y: 300, width: 400, height: 400 });
});

test('buildCenteredSquareCrop 正方形图整张选中', () => {
  assert.deepEqual(buildCenteredSquareCrop(500, 500), { x: 0, y: 0, width: 500, height: 500 });
});

test('dataUrlToBase64 剥离 data URL 前缀', () => {
  assert.equal(dataUrlToBase64('data:image/png;base64,AAAB'), 'AAAB');
});

test('dataUrlToBase64 对无前缀文本原样返回', () => {
  assert.equal(dataUrlToBase64('AAAB'), 'AAAB');
});
