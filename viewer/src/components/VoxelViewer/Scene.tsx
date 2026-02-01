import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useBlueprintStore } from '../../store/blueprintStore';
import { VoxelMesh } from './VoxelMesh';
import { LayerControls } from './LayerControls';

function SceneContent() {
  const { getVisibleBlocks, size } = useBlueprintStore();
  const blocks = getVisibleBlocks();

  // Center the structure
  const centerX = size.x / 2;
  const centerY = size.y / 2;
  const centerZ = size.z / 2;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-10, 10, -10]} intensity={0.3} />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={5}
        maxDistance={200}
        target={[centerX, centerY, centerZ]}
      />

      {/* Ground grid */}
      <Grid
        position={[centerX, -0.01, centerZ]}
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#3a4a5a"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#4a5a6a"
        fadeDistance={100}
        fadeStrength={1}
        followCamera={false}
      />

      {/* The voxel structure */}
      <VoxelMesh blocks={blocks} />

      {/* Subtle environment for better visuals */}
      <Environment preset="city" background={false} />
    </>
  );
}

export function Scene() {
  const { size } = useBlueprintStore();

  // Calculate good camera position based on structure size
  const maxDim = Math.max(size.x, size.y, size.z, 10);
  const cameraDistance = maxDim * 2;

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{
          position: [cameraDistance, cameraDistance * 0.7, cameraDistance],
          fov: 50,
          near: 0.1,
          far: 1000,
        }}
        shadows
      >
        <color attach="background" args={['#1a1a2e']} />
        <SceneContent />
      </Canvas>
      <LayerControls />
    </div>
  );
}
