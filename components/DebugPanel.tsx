import React from 'react';
import { AssistantParsedResponse, AvailabilityStatus, ReservationState, ReservationContext } from '../types';
import { ReservationRepository } from '../services/reservations/repository';

interface DebugPanelProps {
  parsedData: AssistantParsedResponse | null;
  availability: AvailabilityStatus;
  setAvailability: (status: AvailabilityStatus) => void;
  reservationState: ReservationState;
  restaurantId: string;
  reservationContext: ReservationContext;
  setReservationContext: React.Dispatch<React.SetStateAction<ReservationContext>>;
  isOpen: boolean;
  onClose: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ 
  parsedData, 
  availability, 
  setAvailability, 
  reservationState, 
  restaurantId,
  reservationContext, 
  setReservationContext, 
  isOpen, 
  onClose 
}) => {
  if (!isOpen) return null;

  // Helper to refresh context based on phone
  const handlePhoneChange = (newPhone: string) => {
    const active = ReservationRepository.getByPhone(restaurantId, newPhone);
    setReservationContext({
      simulatedUserPhone: newPhone,
      hasActiveReservation: active.length > 0,
      activeReservationCount: active.length
    });
  };

  return (
    <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-gray-900 text-gray-200 shadow-xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-l border-gray-700">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-900/95 backdrop-blur z-10">
        <h2 className="text-xl font-mono font-bold text-green-400">System State</h2>
        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full">
           <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-8">
        
        {/* User Identity Simulation */}
        <div className="bg-gray-800 p-4 rounded-lg border border-purple-500/30">
          <h3 className="text-xs uppercase tracking-wider text-purple-400 font-bold mb-3">Simulate User Identity</h3>
           <div className="mb-4">
             <label className="block text-sm text-gray-400 mb-1">User Phone #</label>
             <input 
               type="text" 
               value={reservationContext.simulatedUserPhone} 
               onChange={(e) => handlePhoneChange(e.target.value)}
               placeholder="+34..."
               className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white outline-none focus:border-purple-500"
             />
           </div>
           
           <div className="flex items-center justify-between text-sm">
             <span className="text-gray-400">Active Bookings:</span>
             <span className={`font-bold ${reservationContext.hasActiveReservation ? 'text-green-400' : 'text-gray-600'}`}>
               {reservationContext.activeReservationCount}
             </span>
           </div>
           {reservationContext.hasActiveReservation && (
             <div className="mt-2 text-xs text-gray-500 bg-gray-900/50 p-2 rounded">
                Check console/localStorage for details.
             </div>
           )}
        </div>

        {/* Reservation Flow State */}
        <div className="bg-gray-800 p-4 rounded-lg border border-blue-500/30">
          <h3 className="text-xs uppercase tracking-wider text-blue-400 font-bold mb-3">Conversation Flow</h3>
          <div className="space-y-2 text-sm font-mono">
             <div className="flex justify-between">
               <span className="text-gray-500">Step:</span>
               <span className="text-white bg-blue-900/50 px-2 rounded">{reservationState.step}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-500">Date:</span>
               <span className={reservationState.date ? "text-green-400" : "text-gray-600"}>{reservationState.date || "null"}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-500">Time:</span>
               <span className={reservationState.time ? "text-green-400" : "text-gray-600"}>{reservationState.time || "null"}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-500">Party:</span>
               <span className={reservationState.party_size ? "text-green-400" : "text-gray-600"}>{reservationState.party_size || "null"}</span>
             </div>
             <div className="flex justify-between">
               <span className="text-gray-500">Name:</span>
               <span className={reservationState.name ? "text-green-400" : "text-gray-600"}>{reservationState.name || "null"}</span>
             </div>
              {reservationState.pendingAction && (
                <div className="mt-2 border-t border-gray-700 pt-2 text-yellow-500">
                  <span className="block text-xs uppercase opacity-75">Pending Action:</span>
                  <span>{reservationState.pendingAction.type}</span>
                </div>
             )}
          </div>
        </div>

        {/* System Status (Read Only now mainly) */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-3">Current Availability Status</h3>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              availability === 'available' ? 'bg-green-500' :
              availability === 'not_available' ? 'bg-red-500' : 'bg-yellow-500'
            }`}></div>
            <span className="text-sm font-mono">{availability}</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Calculated automatically by the Reservation Engine based on local capacity.
          </p>
        </div>

        {/* Live Extracted Data */}
        <div className="space-y-2">
           <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold">Last Assistant Output</h3>
           {parsedData ? (
             <div className="bg-black rounded-lg p-4 overflow-x-auto border border-gray-700 shadow-inner">
               <pre className="text-xs font-mono text-blue-300 whitespace-pre-wrap break-words">
                 {JSON.stringify(parsedData, null, 2)}
               </pre>
             </div>
           ) : (
             <div className="text-sm text-gray-500 italic">No structured data available yet.</div>
           )}
        </div>

      </div>
    </div>
  );
};

export default DebugPanel;
