import React from 'react';
import useAnalyticsSender, { sendBatch } from './useAnalyticsSender';
import { AnalyticsContext } from './analyticsContext';

export function AnalyticsProvider({ children }) {
  const sendEvent = useAnalyticsSender();

  return (
    <AnalyticsContext.Provider value={{ sendEvent, sendBatch }}>
      {children}
    </AnalyticsContext.Provider>
  );
}
