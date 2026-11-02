import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ROOMS_PER_IP, MAX_ROOMS_TOTAL, RoomManager } from '../../server/room-manager';

// POST /api/rooms 对同网段任意设备开放，配额缺失等于内存 DoS。

test('per-ip room quota caps creation and reports a typed error', () => {
    const manager = new RoomManager();
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
        const created = manager.createRoom('10.0.0.1', `房${i}`, '房主');
        assert.ok(!('error' in created), `第 ${i + 1} 个房间应可创建`);
    }
    assert.deepEqual(manager.createRoom('10.0.0.1', '超额', '房主'), { error: 'ROOM_LIMIT_PER_IP' });
    // 别的 IP 不受影响
    assert.ok(!('error' in manager.createRoom('10.0.0.2', '别家', '房主')));
});

test('global room quota caps all rooms regardless of ip', () => {
    const manager = new RoomManager();
    for (let i = 0; i < MAX_ROOMS_TOTAL; i++) {
        const created = manager.createRoom(`10.1.0.${i}`, `房${i}`, '房主');
        assert.ok(!('error' in created), `第 ${i + 1} 个房间应可创建`);
    }
    assert.deepEqual(manager.createRoom('10.2.0.1', '超额', '房主'), { error: 'ROOM_LIMIT_TOTAL' });
});

test('deleting a room frees both quotas', () => {
    const manager = new RoomManager();
    const ids: string[] = [];
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
        const created = manager.createRoom('10.0.0.1', `房${i}`, '房主');
        assert.ok(!('error' in created));
        ids.push(created.room.roomId);
    }
    assert.deepEqual(manager.createRoom('10.0.0.1', '超额', '房主'), { error: 'ROOM_LIMIT_PER_IP' });
    manager.deleteRoom(ids[0]);
    assert.ok(!('error' in manager.createRoom('10.0.0.1', '补位', '房主')));
});
