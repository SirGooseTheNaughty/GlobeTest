import * as THREE from 'three';

const canvas = document.getElementById('globe-canvas');
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.touchAction = 'none';

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);
scene.add(camera);

const ambientLight = new THREE.AmbientLight(0x8ca6ff, 0.6);
scene.add(ambientLight);

const keyLight = new THREE.PointLight(0x9dc3ff, 1.2, 20, 2);
keyLight.position.set(4, 3, 5);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x4f6de0, 0.45, 20, 2);
fillLight.position.set(-5, -2, -4);
scene.add(fillLight);

const globeGroup = new THREE.Group();
scene.add(globeGroup);

const globeRadius = 1.8;

const globeBody = new THREE.Mesh(
  new THREE.SphereGeometry(globeRadius, 64, 64),
  new THREE.MeshBasicMaterial({
    side: THREE.FrontSide,
    depthWrite: true,
    colorWrite: false
  })
);
globeBody.renderOrder = -1;
globeGroup.add(globeBody);

const gridMaterial = new THREE.LineBasicMaterial({
  color: 0x4f72b9,
  transparent: true,
  opacity: 0.38
});

function createLatitudeLine(latitudeDeg, segments = 128) {
  const lat = THREE.MathUtils.degToRad(latitudeDeg);
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const lon = (i / segments) * Math.PI * 2;
    const x = globeRadius * cosLat * Math.cos(lon);
    const z = globeRadius * cosLat * Math.sin(lon);
    const y = globeRadius * sinLat;
    points.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, gridMaterial);
}

function createLongitudeLine(longitudeDeg, segments = 128) {
  const lon = THREE.MathUtils.degToRad(longitudeDeg);
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const lat = -Math.PI / 2 + (i / segments) * Math.PI;
    const x = globeRadius * Math.cos(lat) * Math.cos(lon);
    const y = globeRadius * Math.sin(lat);
    const z = globeRadius * Math.cos(lat) * Math.sin(lon);
    points.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, gridMaterial);
}

for (let latitude = -60; latitude <= 60; latitude += 20) {
  globeGroup.add(createLatitudeLine(latitude));
}

for (let longitude = 0; longitude < 180; longitude += 15) {
  globeGroup.add(createLongitudeLine(longitude));
  globeGroup.add(createLongitudeLine(longitude + 180));
}

const dotsLayer = new THREE.Group();
globeGroup.add(dotsLayer);

const connectionsLayer = new THREE.Group();
globeGroup.add(connectionsLayer);

const dotGeometry = new THREE.SphereGeometry(0.018, 16, 16);
const dotMaterial = new THREE.MeshStandardMaterial({
  color: 0xbfe5ff,
  emissive: 0x7ecbff,
  emissiveIntensity: 1.35,
  roughness: 1.0,
  metalness: 0.0,
  transparent: true,
  opacity: 0.42,
  depthWrite: false
});

const dotSpeed = 0.3;
const movers = [];
const neighborsPerDot = 3;
const connectionCurveSegments = 8;
const connectionRadius = globeRadius + 0.002;

const connectionMaterial = new THREE.LineBasicMaterial({
  color: 0x79bfff,
  transparent: true,
  opacity: 0.35,
  depthWrite: false
});

const cursorConnectionMaterial = new THREE.LineBasicMaterial({
  color: 0xff5a5a,
  transparent: true,
  opacity: 0.5,
  depthWrite: false
});

const connectionGeometry = new THREE.BufferGeometry();
const connectionLines = new THREE.LineSegments(connectionGeometry, connectionMaterial);
connectionsLayer.add(connectionLines);

const cursorConnectionGeometry = new THREE.BufferGeometry();
const cursorConnectionLines = new THREE.LineSegments(cursorConnectionGeometry, cursorConnectionMaterial);
connectionsLayer.add(cursorConnectionLines);

let connectionCapacitySegments = 0;
let cursorConnectionCapacitySegments = 0;

const connectionTempPointA = new THREE.Vector3();
const connectionTempPointB = new THREE.Vector3();

function ensureConnectionCapacity(requiredSegments) {
  if (requiredSegments <= connectionCapacitySegments) {
    return;
  }

  connectionCapacitySegments = Math.ceil(requiredSegments * 1.25);
  const positions = new Float32Array(connectionCapacitySegments * 2 * 3);
  connectionGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
}

function ensureCursorConnectionCapacity(requiredSegments) {
  if (requiredSegments <= cursorConnectionCapacitySegments) {
    return;
  }

  cursorConnectionCapacitySegments = Math.ceil(requiredSegments * 1.25);
  const positions = new Float32Array(cursorConnectionCapacitySegments * 2 * 3);
  cursorConnectionGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
}

function slerpOnSurface(startNormal, endNormal, theta, t, outPoint) {
  if (theta < 1e-5) {
    outPoint.copy(startNormal);
  } else {
    const sinTheta = Math.sin(theta);
    const startWeight = Math.sin((1 - t) * theta) / sinTheta;
    const endWeight = Math.sin(t * theta) / sinTheta;

    outPoint.set(
      startNormal.x * startWeight + endNormal.x * endWeight,
      startNormal.y * startWeight + endNormal.y * endWeight,
      startNormal.z * startWeight + endNormal.z * endWeight
    ).normalize();
  }

  outPoint.multiplyScalar(connectionRadius);
}

function writeConnectionArc(startNormal, endNormal, positions, floatIndexRef) {
  const clampedDot = THREE.MathUtils.clamp(startNormal.dot(endNormal), -1, 1);
  const theta = Math.acos(clampedDot);

  for (let segmentIndex = 0; segmentIndex < connectionCurveSegments; segmentIndex += 1) {
    const t0 = segmentIndex / connectionCurveSegments;
    const t1 = (segmentIndex + 1) / connectionCurveSegments;

    slerpOnSurface(startNormal, endNormal, theta, t0, connectionTempPointA);
    slerpOnSurface(startNormal, endNormal, theta, t1, connectionTempPointB);

    positions[floatIndexRef.value] = connectionTempPointA.x;
    positions[floatIndexRef.value + 1] = connectionTempPointA.y;
    positions[floatIndexRef.value + 2] = connectionTempPointA.z;
    positions[floatIndexRef.value + 3] = connectionTempPointB.x;
    positions[floatIndexRef.value + 4] = connectionTempPointB.y;
    positions[floatIndexRef.value + 5] = connectionTempPointB.z;
    floatIndexRef.value += 6;
  }
}

function updateConnections() {
  const dotCount = movers.length;
  const effectiveNeighborCount = Math.min(neighborsPerDot, Math.max(dotCount - 1, 0));
  const includeCursorConnections = hasHoveredPoint;
  const cursorNeighborCount = Math.min(neighborsPerDot, dotCount);

  if (effectiveNeighborCount === 0 && !includeCursorConnections) {
    connectionGeometry.setDrawRange(0, 0);
    cursorConnectionGeometry.setDrawRange(0, 0);
    return;
  }

  const requiredDotConnectionCount = dotCount * effectiveNeighborCount;
  const requiredDotSegments = requiredDotConnectionCount * connectionCurveSegments;
  const requiredCursorSegments = (includeCursorConnections ? cursorNeighborCount : 0) * connectionCurveSegments;
  const hasDotConnections = requiredDotSegments > 0;
  const hasCursorConnections = requiredCursorSegments > 0;

  if (hasDotConnections) {
    ensureConnectionCapacity(requiredDotSegments);
  }

  if (hasCursorConnections) {
    ensureCursorConnectionCapacity(requiredCursorSegments);
  }

  const positions = hasDotConnections ? connectionGeometry.attributes.position.array : null;
  const cursorPositions = hasCursorConnections ? cursorConnectionGeometry.attributes.position.array : null;
  const floatIndexRef = { value: 0 };
  const cursorFloatIndexRef = { value: 0 };
  const cursorNearestIndices = [];

  if (hasCursorConnections) {
    for (let i = 0; i < dotCount; i += 1) {
      const distanceSq = hoveredNormal.distanceToSquared(movers[i].normal);

      if (cursorNearestIndices.length < cursorNeighborCount) {
        cursorNearestIndices.push({ index: i, distanceSq });
        cursorNearestIndices.sort((a, b) => a.distanceSq - b.distanceSq);
      } else if (distanceSq < cursorNearestIndices[cursorNeighborCount - 1].distanceSq) {
        cursorNearestIndices[cursorNeighborCount - 1] = { index: i, distanceSq };
        cursorNearestIndices.sort((a, b) => a.distanceSq - b.distanceSq);
      }
    }
  }

  if (hasDotConnections) {
    for (let i = 0; i < dotCount; i += 1) {
      const originNormal = movers[i].normal;
      const nearestIndices = [];

      for (let j = 0; j < dotCount; j += 1) {
        if (i === j) {
          continue;
        }

        const distanceSq = originNormal.distanceToSquared(movers[j].normal);

        if (nearestIndices.length < effectiveNeighborCount) {
          nearestIndices.push({ index: j, distanceSq });
          nearestIndices.sort((a, b) => a.distanceSq - b.distanceSq);
        } else if (distanceSq < nearestIndices[effectiveNeighborCount - 1].distanceSq) {
          nearestIndices[effectiveNeighborCount - 1] = { index: j, distanceSq };
          nearestIndices.sort((a, b) => a.distanceSq - b.distanceSq);
        }
      }

      for (const neighbor of nearestIndices) {
        writeConnectionArc(originNormal, movers[neighbor.index].normal, positions, floatIndexRef);
      }
    }
  }

  if (hasCursorConnections) {
    for (const cursorNeighbor of cursorNearestIndices) {
      writeConnectionArc(hoveredNormal, movers[cursorNeighbor.index].normal, cursorPositions, cursorFloatIndexRef);
    }
  }

  const vertexCount = floatIndexRef.value / 3;
  connectionGeometry.setDrawRange(0, vertexCount);
  if (hasDotConnections) {
    connectionGeometry.attributes.position.needsUpdate = true;
  }

  const cursorVertexCount = cursorFloatIndexRef.value / 3;
  cursorConnectionGeometry.setDrawRange(0, cursorVertexCount);
  if (hasCursorConnections) {
    cursorConnectionGeometry.attributes.position.needsUpdate = true;
  }
}

function randomUnitVector() {
  const u = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const f = Math.sqrt(1 - u * u);
  return new THREE.Vector3(f * Math.cos(theta), u, f * Math.sin(theta));
}

function createMover(normal, speed = dotSpeed) {
  const tangentSeed = randomUnitVector();
  const tangent = tangentSeed.sub(normal.clone().multiplyScalar(tangentSeed.dot(normal))).normalize();

  const axis = new THREE.Vector3().crossVectors(normal, tangent).normalize();

  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  dot.position.copy(normal).multiplyScalar(globeRadius);
  dotsLayer.add(dot);

  movers.push({
    normal,
    axis,
    speed,
    dot
  });
}

for (let i = 0; i < 160; i += 1) {
  createMover(randomUnitVector());
}

const cursorTarget = new THREE.Vector2(0, 0);
const cursorSmoothed = new THREE.Vector2(0, 0);
const cursorSmoothing = 0.035;
const dragRotationTarget = new THREE.Vector2(0, 0);
const dragPointer = new THREE.Vector2(0, 0);
const dragSensitivity = 0.004;
const maxDragTilt = 0.2;
const maxVerticalRotation = 0.3;
const autoRotationSpeed = 0.08;
const cursorRayTarget = new THREE.Vector2(0, 0);
const cursorRaySmoothed = new THREE.Vector2(0, 0);
const hoverRaycaster = new THREE.Raycaster();
const hoverLocalPoint = new THREE.Vector3();
const hoveredNormal = new THREE.Vector3();
let hasHoveredPoint = false;
let isDragging = false;
let autoRotationY = 0;

function updatePointerTargetsFromClient(clientX, clientY) {
  cursorTarget.x = (clientX / window.innerWidth) * 2 - 1;
  cursorTarget.y = (clientY / window.innerHeight) * 2 - 1;

  cursorRayTarget.x = cursorTarget.x;
  cursorRayTarget.y = -(clientY / window.innerHeight) * 2 + 1;
}

function applyDragMovement(clientX, clientY) {
  const deltaX = clientX - dragPointer.x;
  const deltaY = clientY - dragPointer.y;

  dragRotationTarget.y += deltaX * dragSensitivity;
  dragRotationTarget.x += deltaY * dragSensitivity;
  dragRotationTarget.x = THREE.MathUtils.clamp(dragRotationTarget.x, -maxDragTilt, maxDragTilt);

  dragPointer.set(clientX, clientY);
}

window.addEventListener('mousemove', (event) => {
  updatePointerTargetsFromClient(event.clientX, event.clientY);

  if (isDragging) {
    applyDragMovement(event.clientX, event.clientY);
  }
});

window.addEventListener('mousedown', (event) => {
  isDragging = true;
  dragPointer.set(event.clientX, event.clientY);
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

window.addEventListener('mouseleave', () => {
  isDragging = false;
});

window.addEventListener(
  'touchstart',
  (event) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    event.preventDefault();
    updatePointerTargetsFromClient(touch.clientX, touch.clientY);
    isDragging = true;
    dragPointer.set(touch.clientX, touch.clientY);
  },
  { passive: false }
);

window.addEventListener(
  'touchmove',
  (event) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    event.preventDefault();
    updatePointerTargetsFromClient(touch.clientX, touch.clientY);

    if (isDragging) {
      applyDragMovement(touch.clientX, touch.clientY);
    }
  },
  { passive: false }
);

window.addEventListener('touchend', () => {
  isDragging = false;
});

window.addEventListener('touchcancel', () => {
  isDragging = false;
});

const clock = new THREE.Clock();

function updateMovers(deltaSeconds) {
  for (const mover of movers) {
    const angle = mover.speed * deltaSeconds;
    mover.normal.applyAxisAngle(mover.axis, angle).normalize();

    mover.dot.position.copy(mover.normal).multiplyScalar(globeRadius);
  }
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.04);
  autoRotationY = (autoRotationY + autoRotationSpeed * delta) % (Math.PI * 2);

  cursorSmoothed.lerp(cursorTarget, cursorSmoothing);
  cursorRaySmoothed.lerp(cursorRayTarget, cursorSmoothing);

  hoverRaycaster.setFromCamera(cursorRaySmoothed, camera);
  const hoverHit = hoverRaycaster.intersectObject(globeBody, false)[0];
  if (hoverHit?.point) {
    hoverLocalPoint.copy(hoverHit.point);
    globeGroup.worldToLocal(hoverLocalPoint);
    hoveredNormal.copy(hoverLocalPoint).normalize();
    hasHoveredPoint = true;
  } else {
    hasHoveredPoint = false;
  }

  updateMovers(delta);
  updateConnections();

  const targetRotationY = autoRotationY + dragRotationTarget.y + cursorSmoothed.x * 0.32;
  const targetRotationX = THREE.MathUtils.clamp(
    dragRotationTarget.x + cursorSmoothed.y * 0.2,
    -maxVerticalRotation,
    maxVerticalRotation
  );

  globeGroup.rotation.y = THREE.MathUtils.lerp(globeGroup.rotation.y, targetRotationY, 0.035);
  globeGroup.rotation.x = THREE.MathUtils.lerp(globeGroup.rotation.x, targetRotationX, 0.035);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
});
