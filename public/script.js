import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let socket, playerId = null, players = {}, score = 0, totalCoins = 15;
let scene, camera, renderer, controls, playerMesh = null, playerMeshes = {}, coinMeshes = {};
const keys = { w: false, a: false, s: false, d: false };
let isConnected = false, time = 0;

const CONFIG = { worldSize: 8.5, moveSpeed: 0.15 };

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(8, 6, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.prepend(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2;

    const ambient = new THREE.AmbientLight(0x404060);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Земля
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 0.7 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(20, 20, 0x4444aa, 0x333366);
    grid.position.y = -1.4;
    scene.add(grid);

    // Деревья
    [[-6,-6],[6,-6],[-6,6],[6,6],[-8,0],[8,0],[0,-8],[0,8]].forEach(([x,z]) => {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.6), new THREE.MeshStandardMaterial({ color: 0x8B6914 }));
        trunk.position.y = -1.2;
        g.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.5,8,8), new THREE.MeshStandardMaterial({ color: 0x2d8a4e }));
        crown.position.y = -0.7;
        crown.scale.y = 0.8;
        g.add(crown);
        g.position.set(x, 0, z);
        scene.add(g);
    });

    connectWebSocket();
    setupEvents();
    animate();
}

function connectWebSocket() {
    const wsUrl = `ws://${window.location.host}`;
    socket = new WebSocket(wsUrl);
    socket.onopen = () => { console.log('🔗 Подключено'); isConnected = true; updateConnectionStatus(true); };
    socket.onmessage = (e) => { try { handleServerMessage(JSON.parse(e.data)); } catch(error) { console.error(error); } };
    socket.onclose = () => { console.log('🔌 Отключено'); isConnected = false; updateConnectionStatus(false); setTimeout(connectWebSocket, 3000); };
}

function handleServerMessage(data) {
    switch(data.type) {
        case 'init': handleInit(data); break;
        case 'player_joined': addPlayer(data.player); break;
        case 'player_left': removePlayer(data.playerId); break;
        case 'player_moved': updatePlayerPosition(data.playerId, data.position, data.rotation); break;
        case 'chat': addChatMessage(data.playerName, data.message); break;
    }
}

function handleInit(data) {
    playerId = data.playerId;
    totalCoins = data.config.coinsCount || 15;
    createPlayerMesh(data.playerId, data.players.find(p => p.id === data.playerId));
    data.players.forEach(p => { if (p.id !== data.playerId) addPlayer(p); });
    data.coins.forEach(c => { if (!c.collected) createCoin(c.id, c.position); });
    updateUI();
    updatePlayersList();
}

function createPlayerMesh(id, playerData) {
    const color = playerData?.color || '#FF6B6B';
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 })
    );
    mesh.castShadow = mesh.receiveShadow = true;
    if (playerData) {
        mesh.position.set(playerData.position.x, playerData.position.y || 0, playerData.position.z);
        mesh.rotation.y = playerData.rotation || 0;
    }
    scene.add(mesh);
    if (id === playerId) playerMesh = mesh;
    else playerMeshes[id] = mesh;
    return mesh;
}

function addPlayer(playerData) {
    if (playerData.id === playerId || playerMeshes[playerData.id]) return;
    createPlayerMesh(playerData.id, playerData);
    updatePlayersList();
}

function removePlayer(id) {
    if (playerMeshes[id]) { scene.remove(playerMeshes[id]); delete playerMeshes[id]; }
    updatePlayersList();
}

function updatePlayerPosition(id, position, rotation) {
    const mesh = id === playerId ? playerMesh : playerMeshes[id];
    if (!mesh) return;
    mesh.position.set(position.x, position.y || 0, position.z);
    if (rotation !== undefined) mesh.rotation.y = rotation;
}

function createCoin(coinId, position) {
    const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.15, 16),
        new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9, emissive: 0xffaa00, emissiveIntensity: 0.1 })
    );
    coin.position.set(position.x, position.y || 0, position.z);
    coin.castShadow = coin.receiveShadow = true;
    coin.rotation.x = Math.PI / 2;
    coin.userData = { id: coinId, floatPhase: Math.random() * Math.PI * 2 };
    scene.add(coin);
    coinMeshes[coinId] = coin;
}

function addChatMessage(name, message) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<strong>${name}</strong>: ${message}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function updateUI() {
    document.getElementById('score').textContent = `💰 ${score}`;
}

function updatePlayersList() {
    const container = document.getElementById('players-container');
    container.innerHTML = '';
    Object.values(players).sort((a,b) => b.score - a.score).forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-item' + (p.id === playerId ? ' me' : '');
        div.innerHTML = `<span class="player-dot" style="background:${p.color}"></span><span class="player-name">${p.name}</span><span class="player-score">${p.score} 🪙</span>`;
        container.appendChild(div);
    });
}

function updateConnectionStatus(connected) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = connected ? 'connected' : 'disconnected';
    text.textContent = connected ? 'Подключено' : 'Отключено. Переподключение...';
}

function sendMovement() {
    if (!socket || socket.readyState !== WebSocket.OPEN || !playerMesh) return;
    socket.send(JSON.stringify({
        type: 'move',
        x: playerMesh.position.x, y: playerMesh.position.y || 0,
        z: playerMesh.position.z, rotation: playerMesh.rotation.y || 0
    }));
}

function setupEvents() {
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) { keys[key] = true; e.preventDefault(); }
        if (e.key === 'Enter' && document.activeElement?.id === 'chat-input') {
            const input = document.getElementById('chat-input');
            if (input.value.trim()) {
                socket.send(JSON.stringify({ type: 'chat', message: input.value.trim() }));
                input.value = '';
            }
        }
    });
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) { keys[key] = false; e.preventDefault(); }
    });
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('chat-input');
            if (input.value.trim()) {
                socket.send(JSON.stringify({ type: 'chat', message: input.value.trim() }));
                input.value = '';
            }
        }
    });
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function animate() {
    time += 0.01;
    if (playerMesh && isConnected) {
        let dx = 0, dz = 0;
        if (keys.w) dz -= CONFIG.moveSpeed;
        if (keys.s) dz += CONFIG.moveSpeed;
        if (keys.a) dx -= CONFIG.moveSpeed;
        if (keys.d) dx += CONFIG.moveSpeed;
        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }
        let newX = Math.max(-CONFIG.worldSize, Math.min(CONFIG.worldSize, playerMesh.position.x + dx));
        let newZ = Math.max(-CONFIG.worldSize, Math.min(CONFIG.worldSize, playerMesh.position.z + dz));
        playerMesh.position.x = newX;
        playerMesh.position.z = newZ;
        if (dx !== 0 || dz !== 0) {
            const targetAngle = Math.atan2(dx, dz);
            let diff = targetAngle - playerMesh.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            playerMesh.rotation.y += diff * 0.1;
            playerMesh.position.y = Math.sin(time * 8) * 0.08;
        } else {
            playerMesh.position.y += (0 - playerMesh.position.y) * 0.05;
        }
        sendMovement();
    }
    Object.values(coinMeshes).forEach(coin => {
        coin.rotation.z += 0.02;
        coin.position.y = Math.sin(time * 2 + (coin.userData.floatPhase || 0)) * 0.2;
    });
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

init();