# Globe 3D animation test

## General task

Set up a minimal 3D web animation using Three.js. The scene should visualize a minimalistic globe with latitude and longitude lines, with many dots moving in constant directions across the globe surface. The dots should be small, smooth, hazy, emit a soft blue glow, and leave trails that slowly dissipate. The globe should be interactive: it should slightly rotate according to cursor position, and clicking the globe should spawn a new dot moving in a random direction.

## Latest requirements (updated)

1. A Three.js project is set up and runnable.
	- Build output uses relative asset paths so deployment works on GitHub Pages.

2. A centered globe animation is rendered in a full-screen container.
	- The globe has a slow constant automatic rotation.

3. Globe body rendering:
	- The globe body itself is not visibly colored.
	- An invisible front-side depth occluder is used so back-side dots and grid lines are hidden.

4. Dots animation:
	- Many dots move continuously along the globe surface in different constant directions.
	- Dots are smaller than the initial version.
	- Dots are less rough (smoother look), hazy, and emit a soft blue light.
	- Trails are temporarily disabled.
	- Each dot is always connected to its 3 closest dots with simple lines across the globe surface.
	- When the cursor is on the globe, only the 3 most proximate dots draw connection lines to the cursor point across the globe surface.
	- Cursor connection lines use a red shade to visually distinguish them from regular dot-to-dot connections.
	- Cursor-proximity opacity change is disabled; dots keep a fixed opacity.
	- Cursor proximity mapping is aligned with screen position and not reversed on the Y axis.
	- All dots move at the same speed.

5. Cursor interaction:
	- Globe rotates slightly based on cursor movement.
	- Y-axis cursor behavior matches the same directional convention as X-axis (no inverted feel).
	- Mouse move response is intentionally smoother and slightly delayed.
	- Globe can be spun by click-and-drag movement.
	- Globe can also be spun on mobile via touch-drag gestures.
	- Vertical globe rotation is strongly constrained so poles are almost impossible to bring into view.

6. Click interaction:
	- Click-based spawning of new dots is disabled.