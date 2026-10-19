import mongoose from 'mongoose';
import { isValidDate } from './errors.js';

// Builds a mongo filter for list endpoints from query params, always scoped to the user.
// Returns { filter } or { error } when a param is malformed.
export function buildListFilter(query, userId, { idKeys = [], stringKeys = [], dateKey } = {}) {
  const filter = { userId };

  for (const key of idKeys) {
    if (query[key]) {
      if (!mongoose.isValidObjectId(query[key])) {
        return { error: `Invalid ${key}` };
      }
      filter[key] = query[key];
    }
  }

  for (const key of stringKeys) {
    if (query[key]) {
      filter[key] = String(query[key]);
    }
  }

  if (dateKey) {
    for (const [key, operator] of [['from', '$gte'], ['to', '$lte']]) {
      if (query[key]) {
        if (!isValidDate(query[key])) {
          return { error: `Invalid ${key} date` };
        }
        filter[dateKey] = { ...filter[dateKey], [operator]: new Date(query[key]) };
      }
    }
  }

  return { filter };
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
