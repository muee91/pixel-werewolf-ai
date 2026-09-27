import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomDiscovery, RoomManager } from '../../server/room-manager';

type PublishedService = {
    name: string;
    type: string;
    port: number;
    txt?: Record<string, string>;
};

class FakeBonjour {
    published: PublishedService[] = [];
    unpublishCount = 0;
    destroyed = false;

    publish(service: PublishedService) {
        this.published.push(service);
        return { stop() {} };
    }

    unpublishAll(callback?: () => void) {
        this.unpublishCount += 1;
        callback?.();
    }

    destroy() {
        this.destroyed = true;
    }
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test('each room server instance publishes a collision-resistant mDNS service name', () => {
    const firstBonjour = new FakeBonjour();
    const secondBonjour = new FakeBonjour();
    const roomManager = new RoomManager();
    const first = new RoomDiscovery({
        intervalMs: 0,
        bonjourFactory: () => firstBonjour,
        servicePort: 3102,
    });
    const second = new RoomDiscovery({
        intervalMs: 0,
        bonjourFactory: () => secondBonjour,
        servicePort: 3103,
    });

    first.startBroadcast(roomManager);
    second.startBroadcast(roomManager);

    assert.equal(firstBonjour.published.length, 1);
    assert.equal(secondBonjour.published.length, 1);
    assert.notEqual(firstBonjour.published[0].name, secondBonjour.published[0].name);
    assert.match(firstBonjour.published[0].name, /^AI狼人杀-/);
    assert.match(secondBonjour.published[0].name, /^AI狼人杀-/);
    assert.equal(firstBonjour.published[0].port, 3102);
    assert.equal(secondBonjour.published[0].port, 3103);

    first.stopBroadcast();
    second.stopBroadcast();
});

test('unchanged room counts do not tear down and republish the mDNS service', async () => {
    const bonjour = new FakeBonjour();
    const roomManager = new RoomManager();
    const discovery = new RoomDiscovery({
        intervalMs: 5,
        bonjourFactory: () => bonjour,
    });

    discovery.startBroadcast(roomManager);
    await wait(18);

    assert.equal(bonjour.published.length, 1);
    assert.equal(bonjour.unpublishCount, 0);

    roomManager.createRoom('127.0.0.1', '测试房间', '房主');
    await wait(18);

    assert.equal(bonjour.published.length, 2);
    assert.equal(bonjour.unpublishCount, 1);
    assert.equal(bonjour.published[1].name, bonjour.published[0].name);
    assert.deepEqual(bonjour.published[1].txt, {
        roomCount: '1',
        playerCount: '1',
    });

    discovery.stopBroadcast();
    assert.equal(bonjour.destroyed, true);
});
