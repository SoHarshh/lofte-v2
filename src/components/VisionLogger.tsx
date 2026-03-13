import React, { useState, useRef, useCallback } from 'react';
import { Camera, Check, Loader2, AlertCircle, X, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VisionLoggerProps {
  onDataExtracted: (data: any) => void;
}

export const VisionLogger: React.FC<VisionLoggerProps> = ({ onDataExtracted }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'camera' | 'processing' | 'review' | 'success' | 'error'>('idle');
  const [extractedData, setExtractedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Callback ref: fires the instant the <video> element mounts in the DOM
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && stream) {
      node.srcObject = stream;
      node.play().catch(() => {});
    }
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setStream(mediaStream);
      setStatus('camera');
      setError(null);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access camera. Please check permissions.');
      setStatus('error');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(imageData);
        stopCamera();
        processImage(imageData);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageData = reader.result as string;
        setCapturedImage(imageData);
        processImage(imageData);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async (base64Image: string) => {
    setStatus('processing');
    try {
      const base64Data = base64Image.split(',')[1];

      const response = await fetch('/api/ai/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to analyze image');
      }

      const workoutData = await response.json();
      if (!workoutData.exercises || workoutData.exercises.length === 0) {
        throw new Error("No workout data detected. Please try a clearer photo of the machine screen.");
      }

      setExtractedData(workoutData);
      setStatus('review');
    } catch (err: any) {
      console.error('Error processing image:', err);
      setError(err.message || 'Failed to analyze image. Try a clearer photo.');
      setStatus('error');
    }
  };

  const handleConfirm = () => {
    onDataExtracted(extractedData);
    setStatus('success');
    setTimeout(() => {
      reset();
    }, 2000);
  };

  const reset = () => {
    stopCamera();
    setCapturedImage(null);
    setExtractedData(null);
    setStatus('idle');
    setError(null);
  };

  return (
    <div className="w-full max-w-md flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-xl border border-black/5">
      <div className="w-full flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
          <Camera size={20} />
          Vision Log
        </h3>
        {status !== 'idle' && (
          <button onClick={reset} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <X size={20} className="text-zinc-500" />
          </button>
        )}
      </div>

      <div className="relative w-full aspect-[4/3] bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 p-6 text-center"
            >
              <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-400">
                <Camera size={32} />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900">Scan Machine Summary</p>
                <p className="text-xs text-zinc-500 mt-1">Point at treadmill, rower, or any gym machine screen</p>
              </div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={startCamera}
                  className="flex-1 bg-black text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all"
                >
                  <Camera size={18} />
                  Open Camera
                </button>
                <label className="flex-1 bg-zinc-100 text-zinc-900 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-zinc-200 transition-all">
                  <ImageIcon size={18} />
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </motion.div>
          )}

          {status === 'camera' && (
            <motion.div 
              key="camera"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative w-full h-full"
            >
              <video
                ref={videoCallbackRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-white/30 pointer-events-none m-8 rounded-lg">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white" />
              </div>
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <button 
                  onClick={capturePhoto}
                  className="w-16 h-16 rounded-full border-4 border-white bg-black/20 backdrop-blur-sm flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-white" />
                </button>
              </div>
            </motion.div>
          )}

          {status === 'processing' && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 w-full h-full"
            >
              {capturedImage && (
                <img src={capturedImage} alt="Captured" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-[2px]" />
              )}
              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                <div className="relative">
                  <Loader2 size={48} className="animate-spin text-black" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-black rounded-full animate-ping" />
                  </div>
                </div>
                <p className="mt-4 font-bold text-zinc-900">AI is Analyzing...</p>
                <p className="text-xs text-zinc-500">Extracting machine metrics</p>
              </div>
            </motion.div>
          )}

          {status === 'review' && extractedData && (
            <motion.div 
              key="review"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col w-full h-full bg-white"
            >
              <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Detected Machine</p>
                <p className="text-sm font-bold text-zinc-900">{extractedData.notes || 'Unknown Machine'}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {extractedData.exercises.map((ex: any, i: number) => (
                  <div key={i} className="bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <p className="text-sm font-bold text-zinc-900">{ex.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {ex.sets && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-600 font-medium">{ex.sets} sets</span>}
                      {ex.reps && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-600 font-medium">{ex.reps} reps</span>}
                      {ex.weight && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-600 font-medium">{ex.weight} lbs</span>}
                      {ex.distance && <span className="text-[10px] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 text-blue-600 font-medium">{(ex.distance / 1000).toFixed(2)} km</span>}
                      {ex.duration && <span className="text-[10px] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 text-blue-600 font-medium">{Math.floor(ex.duration / 60)}m {ex.duration % 60}s</span>}
                      {ex.calories && <span className="text-[10px] bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 text-orange-600 font-medium">{ex.calories} kcal</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-zinc-100 flex gap-2">
                <button 
                  onClick={reset}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs text-zinc-500 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                >
                  Retake
                </button>
                <button 
                  onClick={handleConfirm}
                  className="flex-[2] py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  Add to Session
                </button>
              </div>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg">
                <Check size={40} />
              </div>
              <p className="font-bold text-zinc-900">Added Successfully!</p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 p-6 text-center"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                <AlertCircle size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900">Analysis Failed</p>
                <p className="text-xs text-zinc-500 mt-1">{error}</p>
              </div>
              <button 
                onClick={reset}
                className="bg-black text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      
      {status === 'idle' && (
        <p className="mt-4 text-[10px] text-zinc-400 text-center max-w-[200px]">
          Works best with clear photos of the machine summary screen after your workout.
        </p>
      )}
    </div>
  );
};
