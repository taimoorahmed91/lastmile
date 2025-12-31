
export interface User {
  username: string;
}

export interface ParkingLot {
  name: string;
  distanceFromDest: string;
  walkTimeMins: number;
  entranceType: string;
}

export interface TripAnalysis {
  destination: string;
  timestamp: number;
  isOpenAtArrival: boolean;
  closingTime?: string;
  lastClosingTime?: string;
  nextOpeningTime?: string;
  
  driving: {
    driveTimeMins: number;
    trafficTrend?: 'improving' | 'stable' | 'worsening';
    trafficStatus: 'Congested' | 'Semi-Congested' | 'Open' | 'Heavy Traffic' | 'Clear' | 'Moderate' | 'Gridlock';
    parkingOptions?: ParkingLot[];
    totalTimeMins: number; // drive + park-walk
  };

  walking: {
    walkTimeMins: number;
    temperature?: number; // In Celsius
    weatherAlert?: string;
    weatherCondition?: string; // e.g., "Clear Sky", "Heavy Snow"
    isRecommended?: boolean;
    recommendationReason?: string; // e.g., "High heat", "Heavy rain", "Safe distance"
  };

  groundingSources: Array<{
    title: string;
    uri: string;
  }>;
}

export interface SharedSnapshot {
  id: string;
  from: string;
  to: string;
  data: TripAnalysis;
  sentAt: number;
}