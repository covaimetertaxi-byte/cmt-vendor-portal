export interface InvoiceData {
  company: {
    name: string;
    logo: string | null;
    address: string;
    phone: string;
    email: string;
    website: string;
    customInfo: string;
  };
  invoice: {
    number: string;
    date: string;
  };
  passenger: {
    name: string;
    phone: string;
  };
  trip: {
    pickup: string;
    drop: string;
    startTime?: string;
    endTime?: string;
    duration?: string;
    routeMap?: string;
  };
  vehicle: {
    type: string;
    number: string;
  };
  fare: {
    distance: number;
    ratePerKm: number;
    distanceFare?: number;
    baseFare: number;
    advancePaid: number;
    waitingMinutes: number;
    waitingRate: number;
    waitingFare?: number;
    minFareAdjustment?: number;
    toll: number;
    permit: number;
    driverBata: number;
    peakCharge: number;
    extraCharges: number;
    hours: number;
    ratePerHour: number;
    packageKm?: number;
    extraKms: number;
    extraKmsRate: number;
    extraKmsFare?: number;
    extraTime?: number;
    extraTimeRate?: number;
    extraTimeFare?: number;
    extraTimeUnit?: 'mins' | 'hours';
    surcharge: number;
    dayRent: number;
    hillsCharge: number;
    taxPercentage: number;
    taxLabel: string;
  };
  driver: {
    name: string;
    photoUrl?: string;
  };
  notes: string;
}

export const VEHICLE_TYPES = [
  'Mini', 
  'Sedan', 
  'Prime Sedan', 
  'SUV', 
  'SUV+', 
  'Innova', 
  'Tempo Traveller', 
  'Tourist Bus', 
  'Coach Bus', 
  'Urbania'
];

export const INITIAL_DATA: InvoiceData = {
  company: {
    name: '',
    logo: null,
    address: '',
    phone: '',
    email: '',
    website: '',
    customInfo: '',
  },
  invoice: {
    number: `INV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
    date: new Date().toISOString().split('T')[0],
  },
  passenger: {
    name: '',
    phone: '',
  },
  trip: {
    pickup: '',
    drop: '',
    startTime: '',
    endTime: '',
    duration: '',
  },
  vehicle: {
    type: '',
    number: '',
  },
  fare: {
    distance: 0,
    ratePerKm: 0,
    baseFare: 0,
    advancePaid: 0,
    waitingMinutes: 0,
    waitingRate: 0,
    toll: 0,
    permit: 0,
    driverBata: 0,
    peakCharge: 0,
    extraCharges: 0,
    hours: 0,
    ratePerHour: 0,
    extraKms: 0,
    extraKmsRate: 0,
    extraTime: 0,
    extraTimeRate: 0,
    extraTimeFare: 0,
    surcharge: 0,
    dayRent: 0,
    hillsCharge: 0,
    taxPercentage: 0,
    taxLabel: '',
  },
  driver: {
    name: '',
  },
  notes: '',
};
