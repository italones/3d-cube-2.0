const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const WORLD_SIZE = 8.5;
const COINS_COUNT = 15;

let players = {};
let coins = [];

class Player {
    constructor(id, name = `Игрок ${id.slice(0, 4)}`) {
        this.id = id;
        this.name = name;
        this.position = { x: (Math.random() - 0.5) * 4, y: 0, z: (Math.random() - 0.5) * 4 };
        this.rotation = 0;
        this.score = 0;
        this.color = this.randomColor();
        this.isAlive = true;
    }

    randomColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8A5C', '#A29BFE'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    toJSON() {
        return { id: this.id, name: this.name, position: this.position, rotation: this.rotation, score: this.score, color: this.color };
    }
}

function generateCoins() {
    coins = [];
    for (let i = 0; i < COINS_COUNT; i++) {
        let position;
        do {
            const x = (Math.random() - 0.5) * WORLD_SIZE * 1.8;
            const z = (Math.random() - 0.5) * WORLD_SIZE * 1.8;
            position = { x, y: 0, z };
        } while (Math.sqrt(position.x * position.x + position.z * position.z) < 2);
        
        coins.push({ id: uuidv4(), position, collected: false });
    }
    console.log(`🪙 Сгенерировано ${COINS_COUNT} монет`);
}

wss.on('connection', (ws) => {
    const playerId = uuidv4();
    const player = new Player(playerId);
    players[playerId] = player;

    console.log(`👤 Игрок подключился: ${player.name}`);

    ws.send(JSON.stringify({
        type: 'init',
        playerId: playerId,
        players: Object.values(players).map(p => p.toJSON()),
        coins: coins.map(c => ({ id: c.id, position: c.position, collected: c.collected })),
        config: { worldSize: WORLD_SIZE, coinsCount: COINS_COUNT }
    }));

    broadcast({ type: 'player_joined', player: player.toJSON() }, ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'move':
                    const p = players[playerId];
                    if (p) {
                        p.position.x = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, data.x));
                        p.position.z = Math.max(-WORLD_SIZE, Math.min(WORLD_SIZE, data.z));
                        p.position.y = data.y || 0;
                        p.rotation = data.rotation || 0;
                        broadcast({ type: 'player_moved', playerId, position: p.position, rotation: p.rotation });
                    }
                    break;
                case 'chat':
                    broadcast({ type: 'chat', playerName: player.name, message: data.message });
                    break;
            }
        } catch (error) {
            console.error('❌ Ошибка:', error);
        }
    });

    ws.on('close', () => {
        console.log(`👋 Игрок отключился: ${player.name}`);
        delete players[playerId];
        broadcast({ type: 'player_left', playerId });
    });
});

function broadcast(data, exclude = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

app.use(express.static('public'));
app.use(express.json());

app.get('/api/stats', (req, res) => {
    res.json({
        players: Object.values(players).map(p => p.toJSON()),
        totalPlayers: Object.keys(players).length,
        coinsLeft: coins.filter(c => !c.collected).length,
        totalCoins: coins.length
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

generateCoins();
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   🎮 3D Мультиплеер "Собери монетки"     ║
╠═══════════════════════════════════════════╣
║   🌐 Сервер запущен на порту: ${PORT}       ║
║   🔗 Открой: http://localhost:${PORT}      ║
╚═══════════════════════════════════════════╝
    `);
});