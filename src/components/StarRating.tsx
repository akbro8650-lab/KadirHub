import { Star } from 'lucide-react';

interface StarRatingDisplayProps {
  rating: number;
  count?: number;
  size?: 'sm' | 'md';
}

export function StarRatingDisplay({ rating, count, size = 'sm' }: StarRatingDisplayProps) {
  const rounded = Math.round(rating * 2) / 2;
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div className="inline-flex items-center gap-1.5" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= Math.floor(rounded) || (star - 0.5 === rounded);
          return (
            <Star
              key={star}
              className={`${iconClass} ${
                filled ? 'fill-amber-500 text-amber-500' : 'fill-transparent text-slate-300'
              }`}
            />
          );
        })}
      </div>
      <span className="text-xs font-medium text-slate-700 tabular-nums">
        {rating > 0 ? rating.toFixed(1) : 'New'}
      </span>
      {typeof count === 'number' && (
        <span className="text-xs text-slate-500 tabular-nums">({count})</span>
      )}
    </div>
  );
}

interface StarRatingInputProps {
  value: number;
  onChange: (value: number) => void;
}

export function StarRatingInput({ value, onChange }: StarRatingInputProps) {
  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="Select star rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            onClick={() => onChange(star)}
            className="p-1.5 rounded hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Star
              className={`w-5 h-5 transition-colors ${
                active ? 'fill-amber-500 text-amber-500' : 'fill-transparent text-slate-300'
              }`}
            />
          </button>
        );
      })}
      <span className="ml-2 text-xs font-mono text-slate-600 tabular-nums">{value}/5</span>
    </div>
  );
}
