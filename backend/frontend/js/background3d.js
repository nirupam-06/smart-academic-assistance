import * as THREE from 'three';

/* =========================================================
   SMART STUDY ASSISTANT - CLEAN KNOWLEDGE NETWORK
   ========================================================= */

// ----------------------
// Scene Setup
// ----------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a); // deep academic navy

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    1000
);
camera.position.z = 80;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.domElement.style.position = "fixed";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.width = "100vw";
renderer.domElement.style.height = "100vh";
renderer.domElement.style.zIndex = "-1";
renderer.domElement.style.pointerEvents = "none";

document.body.prepend(renderer.domElement);

// ----------------------
// Create Floating Points
// ----------------------
const pointCount = 120;
const points = [];
const positions = new Float32Array(pointCount * 3);

for (let i = 0; i < pointCount; i++) {
    const x = (Math.random() - 0.5) * 120;
    const y = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 60;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    points.push({
        velocityX: (Math.random() - 0.5) * 0.05,
        velocityY: (Math.random() - 0.5) * 0.05
    });
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
    color: 0x94a3b8, // soft slate
    size: 1.5,
    transparent: true,
    opacity: 0.8
});

const pointMesh = new THREE.Points(geometry, material);
scene.add(pointMesh);

// ----------------------
// Connection Lines
// ----------------------
const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.4
});

let lineSegments = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    lineMaterial
);
scene.add(lineSegments);

// ----------------------
// Mouse Parallax
// ----------------------
let mouseX = 0;
let mouseY = 0;

window.addEventListener("mousemove", (event) => {
    mouseX = (event.clientX / window.innerWidth - 0.5) * 20;
    mouseY = -(event.clientY / window.innerHeight - 0.5) * 10;
});

// ----------------------
// Animation Loop
// ----------------------
function animate() {
    requestAnimationFrame(animate);

    const positions = geometry.attributes.position.array;

    // Move points gently
    for (let i = 0; i < pointCount; i++) {
        positions[i * 3] += points[i].velocityX;
        positions[i * 3 + 1] += points[i].velocityY;

        // Wrap around edges
        if (positions[i * 3] > 60 || positions[i * 3] < -60)
            points[i].velocityX *= -1;
        if (positions[i * 3 + 1] > 40 || positions[i * 3 + 1] < -40)
            points[i].velocityY *= -1;
    }

    geometry.attributes.position.needsUpdate = true;

    // Create connections
    const connectionPositions = [];

    for (let i = 0; i < pointCount; i++) {
        for (let j = i + 1; j < pointCount; j++) {
            const dx = positions[i * 3] - positions[j * 3];
            const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
            const dz = positions[i * 3 + 2] - positions[j * 3 + 2];

            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (distance < 18) {
                connectionPositions.push(
                    positions[i * 3],
                    positions[i * 3 + 1],
                    positions[i * 3 + 2],
                    positions[j * 3],
                    positions[j * 3 + 1],
                    positions[j * 3 + 2]
                );
            }
        }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(connectionPositions, 3)
    );

    lineSegments.geometry.dispose();
    lineSegments.geometry = lineGeometry;

    // Subtle parallax
    camera.position.x += (mouseX - camera.position.x) * 0.02;
    camera.position.y += (mouseY - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
}

animate();

// ----------------------
// Resize Handling
// ----------------------
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
