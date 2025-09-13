import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// 1. Core Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFDD0); // Creamy yellow background

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 5, 8);
camera.lookAt(0, 0, 0);

// CORRECTED: The Audio Listener must be created and added to the camera
// BEFORE any Audio objects try to use it.
const listener = new THREE.AudioListener();
camera.add(listener);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Post-processing Setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.7, // strength
  0.5, // radius
  0.85 // threshold
);
composer.addPass(bloomPass);

// 2. Loaders and Reusable Materials
const textureLoader = new THREE.TextureLoader();
const audioLoader = new THREE.AudioLoader();

const cheeseCollectibleTexture = textureLoader.load('/textures/cheese.jpg');
const cheeseCollectibleMaterial = new THREE.MeshLambertMaterial({ map: cheeseCollectibleTexture });

const collectSound = new THREE.Audio(listener); // Now this works, because listener exists.
audioLoader.load('/sounds/collect.mp3', function(buffer) {
  collectSound.setBuffer(buffer);
  collectSound.setLoop(false);
  collectSound.setVolume(0.5);
});

// 3. Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// 4. Game Objects
const groundGeometry = new THREE.PlaneGeometry(20, 50);
const woodTexture = textureLoader.load('/textures/wood.jpg');
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(5, 50);
const groundMaterial = new THREE.MeshLambertMaterial({ map: woodTexture });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.scale.x = 0.5;
ground.receiveShadow = true;
scene.add(ground);

const poppyGeometry = new THREE.PlaneGeometry(1, 1);
const poppyTexture = textureLoader.load('/textures/poppy.png');
const poppyMaterial = new THREE.MeshLambertMaterial({
  map: poppyTexture,
  transparent: true
});
const poppy = new THREE.Mesh(poppyGeometry, poppyMaterial);
poppy.position.set(0, 1.0, 0);
poppy.scale.set(2, 2, 2);
poppy.castShadow = true;
scene.add(poppy);

// 5. Game State and Variables
let gameRunning = true;
const moveSpeed = 0.2;
const gameSpeed = 0.08;
const cheeses = [];
let score = 0;
const keys = { a: false, d: false };

// 6. Game Logic Functions
function spawnCheese() {
  if (!gameRunning) return;

  const cheeseGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const cheese = new THREE.Mesh(cheeseGeometry, cheeseCollectibleMaterial);

  cheese.position.x = (Math.random() - 0.5) * 9;
  cheese.position.y = 0.75; // Adjusted y so it's not halfway in the floor
  cheese.position.z = -25;
  cheese.castShadow = true;

  scene.add(cheese);
  cheeses.push(cheese);
}

function updateScoreboard() {
  const scoreboardElement = document.getElementById('scoreboard');
  scoreboardElement.textContent = `Cheese: ${score} / 10`;
}

function checkCollision(obj1, obj2) {
  const box1 = new THREE.Box3().setFromObject(obj1);
  const box2 = new THREE.Box3().setFromObject(obj2);
  return box1.intersectsBox(box2);
}

// 7. Event Listeners
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'a') keys.a = true;
  if (event.key.toLowerCase() === 'd') keys.d = true;
});

window.addEventListener('keyup', (event) => {
  if (event.key.toLowerCase() === 'a') keys.a = false;
  if (event.key.toLowerCase() === 'd') keys.d = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Main Animation Loop
let cheeseInterval;
let animationId;

function animate() {
  if (!gameRunning) return;

  animationId = requestAnimationFrame(animate);

  // Player Movement
  if (keys.a && poppy.position.x > -4.5) { // Adjusted boundaries for narrower board
    poppy.position.x -= moveSpeed;
  }
  if (keys.d && poppy.position.x < 4.5) { // Adjusted boundaries for narrower board
    poppy.position.x += moveSpeed;
  }

  // Player Tilt Animation
  let targetRotation = 0;
  if (keys.a) {
    targetRotation = 0.2; // Tilt left
  } else if (keys.d) {
    targetRotation = -0.2; // Tilt right
  }
  
  // Smooth rotation using lerp
  poppy.rotation.z = THREE.MathUtils.lerp(poppy.rotation.z, targetRotation, 0.1);

  // Move and Check Cheese
  for (let i = cheeses.length - 1; i >= 0; i--) {
    const cheese = cheeses[i];
    cheese.position.z += gameSpeed * 2;

    if (cheese.position.z > 10) {
      scene.remove(cheese);
      cheeses.splice(i, 1);
      continue;
    }

    if (checkCollision(poppy, cheese)) {
      if (collectSound.buffer && !collectSound.isPlaying) {
        collectSound.play();
      }

      score++;
      updateScoreboard();
      
      // Add pop animation to scoreboard
      const scoreboardElement = document.getElementById('scoreboard');
      scoreboardElement.classList.add('pop');
      setTimeout(() => {
        scoreboardElement.classList.remove('pop');
      }, 200);
      
      scene.remove(cheese);
      cheeses.splice(i, 1);

      if (score >= 10) {
        gameRunning = false;
        clearInterval(cheeseInterval);
        cancelAnimationFrame(animationId);
        const winScreen = document.getElementById('win-screen');
        if(winScreen) winScreen.style.display = 'flex';
        return;
      }
    }
  }

  composer.render();
}

// 9. Game Start Function
function startGame() {
  cheeseInterval = setInterval(spawnCheese, 3000);
  animate();
}

// 10. Start Screen Logic
const startButton = document.getElementById('start-button');
startButton.addEventListener('click', () => {
  const startScreen = document.getElementById('start-screen');
  startScreen.style.display = 'none';
  startGame();
});