import React from 'react';
import { RestaurantConfig } from '../types';

interface ConfigPanelProps {
  config: RestaurantConfig;
  setConfig: React.Dispatch<React.SetStateAction<RestaurantConfig>>;
  isOpen: boolean;
  onClose: () => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, setConfig, isOpen, onClose }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 left-0 w-full sm:w-96 bg-white shadow-xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-r border-gray-200">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-10">
        <h2 className="text-xl font-bold text-gray-800">Restaurant Config</h2>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" name="name" value={config.name} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input type="text" name="address" value={config.address} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input type="text" name="phone" value={config.phone} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
          <textarea name="hours" rows={2} value={config.hours} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Shifts (Policies)</label>
          <textarea name="shifts" rows={2} value={config.shifts} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
        </div>

        <div className="space-y-3 pt-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" name="hasTerrace" checked={config.hasTerrace} onChange={handleChange} className="form-checkbox h-5 w-5 text-green-600 rounded focus:ring-green-500" />
              <span className="text-gray-700">Has Terrace</span>
            </label>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" name="hasHighChair" checked={config.hasHighChair} onChange={handleChange} className="form-checkbox h-5 w-5 text-green-600 rounded focus:ring-green-500" />
              <span className="text-gray-700">Has High Chairs</span>
            </label>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" name="petsAllowed" checked={config.petsAllowed} onChange={handleChange} className="form-checkbox h-5 w-5 text-green-600 rounded focus:ring-green-500" />
              <span className="text-gray-700">Pets Allowed</span>
            </label>
        </div>
        
         <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (min)</label>
          <input type="number" name="gracePeriodMin" value={config.gracePeriodMin} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">No-Show Policy</label>
          <textarea name="noShowPolicy" rows={2} value={config.noShowPolicy} onChange={handleChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
