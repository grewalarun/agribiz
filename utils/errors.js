// Maps known mongoose/mongo errors to client errors, everything else to 500.
export function handleError(res, error, duplicateMessage = 'Duplicate record') {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ message: duplicateMessage });
  }
  console.error(error);
  return res.status(500).json({ message: 'Server error' });
}

export function isValidDate(value) {
  return value !== undefined && value !== null && value !== '' && !Number.isNaN(new Date(value).getTime());
}
