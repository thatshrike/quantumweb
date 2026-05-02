import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let n = 3, l = 1, m = 1, density = 0.6;
const MAX_PARTICLES = 1000000; // Increased base count for higher density

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 70);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// SHARPER SHADER
const material = new THREE.ShaderMaterial({
    vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // Smaller, crisper point size
            gl_PointSize = 35.0 / -mvPosition.z; 
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        void main() {
            // Cut off the edges sharply to make distinct points instead of fuzzy clouds
            vec2 xy = gl_PointCoord.xy - vec2(0.5);
            if(length(xy) > 0.5) discard;
            // Slight transparency to allow dense areas to glow together
            gl_FragColor = vec4(vColor, 0.85); 
        }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// --- TRUE QUANTUM WAVEFUNCTION MATH --- //
function probDensity(r, theta, n, l, m) {
    const a0 = 1.0; 
    const rho = (2.0 * r) / (n * a0);
    
    // 1. Associated Laguerre Polynomial (Radial part)
    let k = n - l - 1;
    let alpha = 2 * l + 1;
    let L = 1.0;
    if (k === 1) L = 1.0 + alpha - rho;
    else if (k > 1) {
        let Lm2 = 1.0, Lm1 = 1.0 + alpha - rho;
        for (let j = 2; j <= k; ++j) {
            L = ((2 * j - 1 + alpha - rho) * Lm1 - (j - 1 + alpha) * Lm2) / j;
            Lm2 = Lm1;
            Lm1 = L;
        }
    }
    
    // 2. Associated Legendre Polynomial (Angular part)
    let x = Math.cos(theta);
    let m_abs = Math.abs(m);
    let Pmm = 1.0;
    if (m_abs > 0) {
        let somx2 = Math.sqrt((1.0 - x) * (1.0 + x));
        let fact = 1.0;
        for (let j = 1; j <= m_abs; ++j) { Pmm *= -fact * somx2; fact += 2.0; }
    }
    let Plm = Pmm;
    if (l > m_abs) {
        let Pm1m = x * (2 * m_abs + 1) * Pmm;
        if (l === m_abs + 1) Plm = Pm1m;
        else {
            for (let ll = m_abs + 2; ll <= l; ++ll) {
                let Pll = ((2 * ll - 1) * x * Pm1m - (ll + m_abs - 1) * Pmm) / (ll - m_abs);
                Pmm = Pm1m;
                Pm1m = Pll;
            }
            Plm = Pm1m;
        }
    }

    // Probability Density |psi|^2
    let R_part = Math.pow(rho, l) * Math.exp(-rho / 2.0) * L;
    let Y_part = Plm;
    
    return (R_part * R_part) * (Y_part * Y_part);
}

function generateParticles() {
    const posAttr = geometry.attributes.position.array;
    const colAttr = geometry.attributes.color.array;
    const activeParticles = Math.floor(MAX_PARTICLES * density);
    
    geometry.setDrawRange(0, activeParticles);

    // The maximum radius an electron is likely to be found expands with n^2
    const rMax = 12.0 * n * n; 
    
    // Find a localized peak probability to normalize our Monte Carlo sampler
    let maxProb = 0;
    for(let i = 0; i < 3000; i++) {
        let r = Math.random() * rMax;
        let theta = Math.random() * Math.PI;
        // Multiply by volume element r^2 * sin(theta) for spherical sampling
        let prob = probDensity(r, theta, n, l, m) * (r * r * Math.sin(theta)); 
        if(prob > maxProb) maxProb = prob;
    }
    maxProb *= 1.1; // Add a 10% buffer

    let count = 0;
    let attempts = 0;
    const maxAttempts = activeParticles * 150; // Prevent infinite loops

    // Monte Carlo Rejection Sampling
    while(count < activeParticles && attempts < maxAttempts) {
        attempts++;
        
        let r = Math.random() * rMax;
        let theta = Math.random() * Math.PI;
        let phi = Math.random() * 2 * Math.PI;
        
        // Calculate physics probability at this random point
        let p = probDensity(r, theta, n, l, m) * (r * r * Math.sin(theta));
        
        // Only "spawn" the particle if a random roll is less than the probability
        if (Math.random() * maxProb < p) {
            
            // Convert Spherical to Cartesian for rendering
            posAttr[count*3]     = r * Math.sin(theta) * Math.cos(phi);
            posAttr[count*3 + 1] = r * Math.sin(theta) * Math.sin(phi);
            posAttr[count*3 + 2] = r * Math.cos(theta);

            // Distance-based color map (Purple -> Gold -> White)
            // We scale the visual color gradient based on 'n' so it always looks good
            const distanceNorm = Math.min(r / (rMax * 0.35), 1.0);
            
            if (distanceNorm < 0.3) {
                colAttr[count*3] = 0.8; colAttr[count*3+1] = 0.5; colAttr[count*3+2] = 0.8;
            } else if (distanceNorm < 0.7) {
                colAttr[count*3] = 1.0; colAttr[count*3+1] = 0.7 - (distanceNorm - 0.3); colAttr[count*3+2] = 0.2;
            } else {
                colAttr[count*3] = 0.9; colAttr[count*3+1] = 0.9; colAttr[count*3+2] = 1.0;
            }
            count++;
        }
    }
    
    // Hide any uncalculated particles if the loop exited early
    for(let i = count; i < activeParticles; i++) {
        posAttr[i*3] = posAttr[i*3+1] = posAttr[i*3+2] = 0;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
}

// UI Binding
const ids = ['n', 'l', 'm', 'density'];
const els = {};
ids.forEach(id => {
    els[id + 'Slider'] = document.getElementById(id + '-slider');
    els[id + 'Val'] = document.getElementById(id + '-val');
});
const orbitalName = document.getElementById('orbital-name');
const nHeader = document.getElementById('n-val-header');
const lHeader = document.getElementById('l-val-header');
const mHeader = document.getElementById('m-val-header');

const lNames = ["s", "p", "d", "f", "g", "h", "i"];

function updateUIConstraints() {
    els.lSlider.max = n - 1;
    if (l > n - 1) { l = n - 1; els.lSlider.value = l; }
    
    els.mSlider.min = -l; els.mSlider.max = l;
    if (m > l) { m = l; els.mSlider.value = m; }
    if (m < -l) { m = -l; els.mSlider.value = m; }

    els.nVal.innerText = n; nHeader.innerText = n;
    els.lVal.innerText = l; lHeader.innerText = l;
    els.mVal.innerText = m; mHeader.innerText = m;
    els.densityVal.innerText = density.toFixed(1);
    
    orbitalName.innerText = `${n}${lNames[l]}`;
    generateParticles();
}

els.nSlider.addEventListener('input', (e) => { n = parseInt(e.target.value); updateUIConstraints(); });
els.lSlider.addEventListener('input', (e) => { l = parseInt(e.target.value); updateUIConstraints(); });
els.mSlider.addEventListener('input', (e) => { m = parseInt(e.target.value); updateUIConstraints(); });
els.densitySlider.addEventListener('input', (e) => { density = parseFloat(e.target.value); updateUIConstraints(); });

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

updateUIConstraints();

function animate() {
    requestAnimationFrame(animate);
    
    // The Z-axis is our quantization axis (where r * Math.cos(theta) maps).
    // We tie the rotation speed directly to 'm'. 
    // If m=0, it stops. If m is negative, it spins the opposite direction!
    particleSystem.rotation.z += 0.002 * m;
    
    // Reset any arbitrary Y rotation so the atom stays physically oriented
    particleSystem.rotation.y = 0; 
    
    controls.update();
    renderer.render(scene, camera);
}
animate();
