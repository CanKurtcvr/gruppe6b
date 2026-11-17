// ---------------- Real-time Background Removal (Selfie Segmentation) ----------------
async function initBackgroundSegmentation() {
  if (typeof window.SelfieSegmentation !== "function") return;
  try {
    personLayerCanvas = document.createElement("canvas");
    personLayerCanvas.width = 640;
    personLayerCanvas.height = 480;
    personLayerCtx = personLayerCanvas.getContext("2d");

    selfieSegmentation = new window.SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    selfieSegmentation.setOptions({
      modelSelection: 0, // General model: finer edges than the landscape model
    });

    // Temporally smoothed mask: blends each new mask with the previous one so the
    // edge between person and background stops flickering/smearing.
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = 640;
    maskCanvas.height = 480;
    const maskCtx = maskCanvas.getContext("2d");

    selfieSegmentation.onResults((results) => {
      if (!personLayerCtx || !results.segmentationMask) return;
      const w = personLayerCanvas.width;
      const h = personLayerCanvas.height;

      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.globalAlpha = 0.6;
      maskCtx.drawImage(results.segmentationMask, 0, 0, w, h);
      maskCtx.globalAlpha = 1;

      personLayerCtx.save();
      personLayerCtx.clearRect(0, 0, w, h);

      // Mirror horizontally to match flipped webcam coordinate space
      personLayerCtx.translate(w, 0);
      personLayerCtx.scale(-1, 1);

      // Softly feathered mask so the edge blends instead of smearing
      personLayerCtx.filter = "blur(4px)";
      personLayerCtx.drawImage(maskCanvas, 0, 0, w, h);
      personLayerCtx.filter = "none";

      // Keep only the person pixels
      personLayerCtx.globalCompositeOperation = "source-in";
      personLayerCtx.drawImage(results.image, 0, 0, w, h);

      personLayerCtx.restore();
      segmentationReady = true;
    });

    // Continuous segmentation loop
    const runSegLoop = async () => {
      const videoEl = cam?.elt || cam;
      if (
        removeBackgroundEnabled &&
        selfieSegmentation &&
        videoEl &&
        videoEl.readyState >= 2 &&
        !segmentationBusy
      ) {
        segmentationBusy = true;
        try {
          await selfieSegmentation.send({ image: videoEl });
        } catch {}
        segmentationBusy = false;
      }
      requestAnimationFrame(runSegLoop);
    };
    requestAnimationFrame(runSegLoop);
  } catch (err) {
    console.warn("SelfieSegmentation init warning:", err);
  }
}

