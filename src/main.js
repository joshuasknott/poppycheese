import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// 1. Core Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFDD0); // Creamy yellow background

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
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

// Load HDRI for background and environment lighting
const exrLoader = new EXRLoader();
exrLoader.load('/hdri/restaurant.exr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = texture;
  scene.environment = texture;
});

// Post-processing Setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.35, // strength
  0.4, // radius
  0.9 // threshold
);
composer.addPass(bloomPass);

// 2. Loaders and Reusable Materials
const textureLoader = new THREE.TextureLoader();
const audioLoader = new THREE.AudioLoader();
const gltfLoader = new GLTFLoader();

// Load the cheese 3D model
let cheeseModel = null;
gltfLoader.load('/models/cheese/scene.gltf', (gltf) => {
  cheeseModel = gltf.scene;
}, undefined, (error) => {
  console.error('Error loading cheese model:', error);
});

// Load the mousetrap 3D model
let mousetrapModel = null;
gltfLoader.load('/models/mousetrap/scene.gltf', (gltf) => {
  mousetrapModel = gltf.scene;
}, undefined, (error) => {
  console.error('Error loading mousetrap model:', error);
});

// Load the knife 3D model
let knifeModel = null;
gltfLoader.load('/models/knife/scene.gltf', (gltf) => {
  knifeModel = gltf.scene;
}, undefined, (error) => {
  console.error('Error loading knife model:', error);
});

const cheeseCollectibleTexture = textureLoader.load('/textures/cheese.jpg');
const cheeseCollectibleMaterial = new THREE.MeshLambertMaterial({ map: cheeseCollectibleTexture });

const collectSound = new THREE.Audio(listener); // Now this works, because listener exists.
audioLoader.load('/sounds/collect.mp3', function(buffer) {
  collectSound.setBuffer(buffer);
  collectSound.setLoop(false);
  collectSound.setVolume(0.5);
});

// 3. Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -30;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = -30;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// 4. Game Objects
// Load the chopping board 3D model
gltfLoader.load('/models/board/scene.gltf', (gltf) => {
  const board = gltf.scene;
  
  // Scale and position the board
  board.scale.set(15, 15, 160); // Scale to be extra long and narrow
  board.position.y = 0; // Position board flat at ground level
  
  // Enable shadows for all meshes in the model
  board.traverse((child) => {
    if (child.isMesh) {
      child.receiveShadow = true;
      child.castShadow = true;
    }
  });
  
  scene.add(board);
}, undefined, (error) => {
  console.error('Error loading board model:', error);
});

// Load the Poppy Mouse 3D model
let poppy = null;
gltfLoader.load('/models/mouse/scene.gltf', (gltf) => {
  poppy = gltf.scene;
  
  // Load the custom texture for Poppy Mouse
  const mouseTextureLoader = new THREE.TextureLoader();
  const poppyMouseTexture = mouseTextureLoader.load('/models/mouse/textures/poppy_mouse_texture.png');
  
  // Traverse the model to find and replace materials with custom texture
  poppy.traverse((child) => {
    if ((child.isMesh || child.isSkinnedMesh) && child.material) {
      // Apply custom texture to the material
      child.material.map = poppyMouseTexture;
      child.material.needsUpdate = true;
      
      // Disable shadow casting, but allow receiving shadows
      child.castShadow = false;
      child.receiveShadow = true;
    }
  });
  
  // Position and scale the mouse model
  poppy.position.set(0, 1.0, 0);
  poppy.scale.setScalar(1.5); // Adjust scale as needed
  poppy.rotation.y = Math.PI; // Rotate 180 degrees to face away from camera
  
  scene.add(poppy);
}, undefined, (error) => {
  console.error('Error loading mouse model:', error);
});

// 5. Game State and Variables
let gameRunning = true;
const moveSpeed = 0.2;
const gameSpeed = 0.16;
const cheeses = [];
const obstacles = [];
const knives = [];
let score = 0;
let highScore = 0;
const keys = { a: false, d: false };

// Jump mechanics variables
let velocityY = 0;
let isJumping = false;
const gravity = 0.02;
const playerBaseY = 1.0;

// 6. Game Logic Functions
function spawnCheese() {
  if (!gameRunning || !cheeseModel) return;

  // Clone the 3D cheese model
  const cheese = cheeseModel.clone();

  // Position and scale the cheese
  cheese.position.x = (Math.random() - 0.5) * 9;
  cheese.position.y = 1.2; // Raised higher to sit properly on top of the board
  cheese.position.z = -60;
  cheese.scale.setScalar(0.8); // Scale down the cheese model appropriately

  // Enable shadows for all meshes in the cheese model
  cheese.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(cheese);
  cheeses.push(cheese);
}

function spawnObstacle() {
  if (!gameRunning || !mousetrapModel) return;

  // Clone the 3D mousetrap model
  const obstacle = mousetrapModel.clone();

  // Position and scale the mousetrap
  obstacle.position.x = (Math.random() - 0.5) * 9;
  obstacle.position.y = 0.75; // Position on top of chopping board
  obstacle.position.z = -60;
  obstacle.scale.setScalar(1.2); // Scale up the mousetrap model appropriately

  // Enable shadows for all meshes in the mousetrap model
  obstacle.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(obstacle);
  obstacles.push(obstacle);
}

function spawnKnife() {
  if (!gameRunning || !knifeModel) return;

  // Clone the 3D knife model
  const knife = knifeModel.clone();

  // Rotate the knife to lie flat on the board (90 degrees on X-axis)
  knife.rotation.x = Math.PI / 2;

  // Position and scale the knife
  knife.position.x = (Math.random() - 0.5) * 9;
  knife.position.y = 0.5; // Position on top of chopping board
  knife.position.z = -100;
  knife.scale.setScalar(2.0); // Scale up the knife model appropriately

  // Enable shadows for all meshes in the knife model
  knife.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(knife);
  knives.push(knife);
}

function updateScoreboard() {
  const currentScoreElement = document.getElementById('current-score');
  const highScoreElement = document.getElementById('high-score');
  currentScoreElement.textContent = `Score: ${score}`;
  highScoreElement.textContent = `Best: ${highScore}`;
}

function loadHighScore() {
  const saved = localStorage.getItem('poppyHighScore');
  highScore = saved ? parseInt(saved) : 0;
  updateScoreboard();
}

function saveHighScore() {
  localStorage.setItem('poppyHighScore', highScore.toString());
}

function gameOver() {
  gameRunning = false;
  clearInterval(cheeseInterval);
  clearInterval(obstacleInterval);
  clearInterval(knifeInterval);
  cancelAnimationFrame(animationId);
  
  // Update high score if needed
  if (score > highScore) {
    highScore = score;
    saveHighScore();
  }
  
  // Update game over screen
  const finalScoreElement = document.getElementById('final-score');
  const highScoreDisplayElement = document.getElementById('high-score-display');
  const winScreen = document.getElementById('win-screen');
  
  finalScoreElement.textContent = `Final Score: ${score}`;
  highScoreDisplayElement.textContent = `High Score: ${highScore}`;
  winScreen.style.display = 'flex';
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
  if (event.key === ' ' && !isJumping) {
    velocityY = 0.3;
    isJumping = true;
  }
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
let obstacleInterval;
let knifeInterval;
let animationId;

function animate() {
  if (!gameRunning) return;

  animationId = requestAnimationFrame(animate);

  // Player Movement (only if poppy is loaded)
  if (poppy) {
    if (keys.a && poppy.position.x > -4.5) { // Adjusted boundaries for narrower board
      poppy.position.x -= moveSpeed;
    }
    if (keys.d && poppy.position.x < 4.5) { // Adjusted boundaries for narrower board
      poppy.position.x += moveSpeed;
    }

    // Jump physics
    if (isJumping) {
      velocityY -= gravity; // Apply gravity
    }
    
    // Update vertical position
    poppy.position.y += velocityY;
    
    // Ground check
    if (poppy.position.y <= playerBaseY) {
      poppy.position.y = playerBaseY;
      velocityY = 0;
      isJumping = false;
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
  }

  // Move and Check Cheese
  for (let i = cheeses.length - 1; i >= 0; i--) {
    const cheese = cheeses[i];
    cheese.position.z += gameSpeed * 4;

    if (cheese.position.z > 10) {
      scene.remove(cheese);
      cheeses.splice(i, 1);
      continue;
    }

    if (poppy && checkCollision(poppy, cheese)) {
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
    }
  }

  // Move and Check Obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obstacle = obstacles[i];
    obstacle.position.z += gameSpeed * 4;

    if (obstacle.position.z > 10) {
      scene.remove(obstacle);
      obstacles.splice(i, 1);
      continue;
    }

    // Check collision between player and obstacle (mousetrap)
    if (poppy && checkCollision(poppy, obstacle)) {
      gameOver();
      return;
    }
  }

  // Move and Check Knives
  for (let i = knives.length - 1; i >= 0; i--) {
    const knife = knives[i];
    knife.position.z += gameSpeed * 4;

    if (knife.position.z > 10) {
      scene.remove(knife);
      knives.splice(i, 1);
      continue;
    }

    // Check collision between player and knife
    if (poppy && checkCollision(poppy, knife)) {
      gameOver();
      return;
    }
  }

  composer.render();
}

// 9. Game Start Function
function startGame() {
  // Reset game state
  score = 0;
  gameRunning = true;
  loadHighScore();
  updateScoreboard();
  
  // Clear any existing objects
  cheeses.forEach(cheese => scene.remove(cheese));
  obstacles.forEach(obstacle => scene.remove(obstacle));
  knives.forEach(knife => scene.remove(knife));
  cheeses.length = 0;
  obstacles.length = 0;
  knives.length = 0;
  
  // Start spawning
  cheeseInterval = setInterval(spawnCheese, 3000);
  obstacleInterval = setInterval(spawnObstacle, 4000);
  knifeInterval = setInterval(spawnKnife, 7000);
  animate();
}

// 10. Start Screen Logic
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');

startButton.addEventListener('click', () => {
  const startScreen = document.getElementById('start-screen');
  startScreen.style.display = 'none';
  startGame();
});

restartButton.addEventListener('click', () => {
  const winScreen = document.getElementById('win-screen');
  winScreen.style.display = 'none';
  startGame();
});

// Load high score on page load
loadHighScore();