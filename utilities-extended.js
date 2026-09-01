/**
 * ULTIMATE PRO - Extended Utilities & Calculation Library
 * ========================================================
 * Advanced utilities, data processing, and calculation functions
 * ~1500+ lines of production-grade utility code
 */

// ============================================
// EXTENDED MATHEMATICAL FUNCTIONS
// ============================================

const MathUtils = {
    /**
     * Calculate compound interest
     */
    compoundInterest(principal, rate, time, compounds = 12) {
        return principal * Math.pow(1 + (rate / 100 / compounds), compounds * time);
    },

    /**
     * Calculate simple interest
     */
    simpleInterest(principal, rate, time) {
        return principal + (principal * rate * time / 100);
    },

    /**
     * Calculate future value of annuity
     */
    futureValueAnnuity(payment, rate, periods) {
        if (rate === 0) return payment * periods;
        return payment * (Math.pow(1 + rate, periods) - 1) / rate;
    },

    /**
     * Calculate present value of annuity
     */
    presentValueAnnuity(payment, rate, periods) {
        if (rate === 0) return payment * periods;
        return payment * (1 - Math.pow(1 + rate, -periods)) / rate;
    },

    /**
     * Linear regression
     */
    linearRegression(xValues, yValues) {
        if (xValues.length !== yValues.length || xValues.length < 2) {
            return null;
        }

        const n = xValues.length;
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return {
            slope: slope.toFixed(4),
            intercept: intercept.toFixed(4),
            equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(4)}`
        };
    },

    /**
     * Calculate correlation coefficient
     */
    correlation(xValues, yValues) {
        if (xValues.length !== yValues.length || xValues.length < 2) {
            return 0;
        }

        const n = xValues.length;
        const meanX = xValues.reduce((a, b) => a + b, 0) / n;
        const meanY = yValues.reduce((a, b) => a + b, 0) / n;

        const numerator = xValues.reduce((sum, x, i) => {
            return sum + (x - meanX) * (yValues[i] - meanY);
        }, 0);

        const denomX = xValues.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0);
        const denomY = yValues.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);

        return (numerator / Math.sqrt(denomX * denomY)).toFixed(4);
    },

    /**
     * Calculate percentage change
     */
    percentageChange(oldValue, newValue) {
        return ((newValue - oldValue) / oldValue * 100).toFixed(2);
    },

    /**
     * Calculate weighted average
     */
    weightedAverage(values, weights) {
        if (values.length !== weights.length) return 0;
        
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const weighted = values.reduce((sum, val, i) => sum + val * weights[i], 0);
        
        return (weighted / totalWeight).toFixed(2);
    },

    /**
     * Calculate moving average
     */
    movingAverage(values, windowSize) {
        if (values.length < windowSize) return values;
        
        const result = [];
        for (let i = 0; i <= values.length - windowSize; i++) {
            const window = values.slice(i, i + windowSize);
            const avg = window.reduce((a, b) => a + b, 0) / windowSize;
            result.push(avg.toFixed(2));
        }
        return result;
    },

    /**
     * Calculate standard deviation
     */
    standardDeviation(values) {
        if (values.length < 2) return 0;
        
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        
        return Math.sqrt(variance).toFixed(4);
    },

    /**
     * Calculate z-score
     */
    zScore(value, mean, stdDev) {
        if (stdDev === 0) return 0;
        return ((value - mean) / stdDev).toFixed(4);
    }
};

// ============================================
// STRING & TEXT UTILITIES
// ============================================

const StringUtils = {
    /**
     * Convert kebab-case to camelCase
     */
    kebabToCamel(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    },

    /**
     * Convert camelCase to kebab-case
     */
    camelToKebab(str) {
        return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
    },

    /**
     * Truncate string
     */
    truncate(str, length, suffix = '...') {
        if (str.length <= length) return str;
        return str.slice(0, length - suffix.length) + suffix;
    },

    /**
     * Capitalize first letter
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Convert to title case
     */
    titleCase(str) {
        return str.split(' ').map(word => this.capitalize(word)).join(' ');
    },

    /**
     * Count occurrences of substring
     */
    countOccurrences(str, substr) {
        return str.split(substr).length - 1;
    },

    /**
     * Reverse string
     */
    reverse(str) {
        return str.split('').reverse().join('');
    },

    /**
     * Generate random string
     */
    randomString(length = 10) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * HTML encode
     */
    htmlEncode(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * HTML decode
     */
    htmlDecode(str) {
        const div = document.createElement('div');
        div.innerHTML = str;
        return div.textContent;
    }
};

// ============================================
// DATE & TIME UTILITIES
// ============================================

const DateUtils = {
    /**
     * Add days to date
     */
    addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    },

    /**
     * Get days between dates
     */
    daysBetween(date1, date2) {
        const oneDay = 24 * 60 * 60 * 1000;
        return Math.round(Math.abs((date1 - date2) / oneDay));
    },

    /**
     * Get day name
     */
    getDayName(date) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[date.getDay()];
    },

    /**
     * Get month name
     */
    getMonthName(date) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
        return months[date.getMonth()];
    },

    /**
     * Get week number
     */
    getWeekNumber(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    },

    /**
     * Check if leap year
     */
    isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    },

    /**
     * Get days in month
     */
    getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    },

    /**
     * Format duration
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${hours}h ${minutes}m ${secs}s`;
    }
};

// ============================================
// ARRAY & COLLECTION UTILITIES
// ============================================

const ArrayUtils = {
    /**
     * Remove duplicates
     */
    removeDuplicates(arr, key) {
        if (!key) return [...new Set(arr)];
        
        const seen = new Set();
        return arr.filter(item => {
            const val = item[key];
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
        });
    },

    /**
     * Flatten nested array
     */
    flatten(arr, depth = Infinity) {
        let result = [];
        for (let item of arr) {
            if (Array.isArray(item) && depth > 0) {
                result.push(...this.flatten(item, depth - 1));
            } else {
                result.push(item);
            }
        }
        return result;
    },

    /**
     * Chunk array
     */
    chunk(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    },

    /**
     * Shuffle array
     */
    shuffle(arr) {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    },

    /**
     * Uniq and sorted
     */
    uniqueSorted(arr) {
        return [...new Set(arr)].sort((a, b) => a - b);
    },

    /**
     * Find intersection
     */
    intersection(arr1, arr2) {
        return arr1.filter(item => arr2.includes(item));
    },

    /**
     * Find difference
     */
    difference(arr1, arr2) {
        return arr1.filter(item => !arr2.includes(item));
    },

    /**
     * Rotate array
     */
    rotate(arr, steps) {
        const n = arr.length;
        steps = steps % n;
        return arr.slice(-steps).concat(arr.slice(0, -steps));
    },

    /**
     * Transpose 2D array
     */
    transpose(matrix) {
        return matrix[0].map((_, i) => matrix.map(row => row[i]));
    }
};

// ============================================
// FILE & STORAGE UTILITIES
// ============================================

const StorageUtils = {
    /**
     * Save to localStorage with expiration
     */
    setWithExpiry(key, value, expiryMs) {
        const item = {
            value: value,
            expiry: new Date().getTime() + expiryMs
        };
        localStorage.setItem(key, JSON.stringify(item));
    },

    /**
     * Get from localStorage with expiration check
     */
    getWithExpiry(key) {
        const item = localStorage.getItem(key);
        if (!item) return null;

        const parsed = JSON.parse(item);
        if (new Date().getTime() > parsed.expiry) {
            localStorage.removeItem(key);
            return null;
        }

        return parsed.value;
    },

    /**
     * Get storage size
     */
    getStorageSize() {
        let size = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                size += localStorage[key].length + key.length;
            }
        }
        return size;
    },

    /**
     * Clear expired items
     */
    clearExpired() {
        const now = new Date().getTime();
        for (let key in localStorage) {
            try {
                const item = JSON.parse(localStorage[key]);
                if (item.expiry && now > item.expiry) {
                    localStorage.removeItem(key);
                }
            } catch (e) {}
        }
    },

    /**
     * Export data
     */
    exportData(filename = 'data.json') {
        const data = {};
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                data[key] = localStorage[key];
            }
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }
};

// ============================================
// NUMBER & CURRENCY UTILITIES
// ============================================

const NumberUtils = {
    /**
     * Format number with separators
     */
    formatNumber(num, decimals = 2) {
        return parseFloat(num).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    },

    /**
     * Parse currency string
     */
    parseCurrency(str) {
        return parseFloat(str.replace(/[^\d.-]/g, ''));
    },

    /**
     * Format as currency
     */
    formatCurrency(num, currency = 'ILS') {
        return new Intl.NumberFormat('he-IL', {
            style: 'currency',
            currency: currency
        }).format(num);
    },

    /**
     * Convert between currencies (mock)
     */
    convertCurrency(amount, fromCurrency, toCurrency) {
        const rates = {
            'USD': 1,
            'EUR': 0.92,
            'ILS': 3.65,
            'GBP': 0.79
        };

        if (!rates[fromCurrency] || !rates[toCurrency]) {
            return amount;
        }

        return (amount * rates[toCurrency] / rates[fromCurrency]).toFixed(2);
    },

    /**
     * Round to nearest
     */
    roundToNearest(num, nearest = 0.5) {
        return Math.round(num / nearest) * nearest;
    },

    /**
     * Format bytes
     */
    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return (size.toFixed(2) + ' ' + units[unitIndex]);
    }
};

// ============================================
// VALIDATION UTILITIES
// ============================================

const ValidationUtils = {
    /**
     * Is valid JSON
     */
    isValidJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Is valid URL
     */
    isValidURL(str) {
        try {
            new URL(str);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Is valid hex color
     */
    isValidHexColor(str) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(str);
    },

    /**
     * Is valid phone number
     */
    isValidPhoneNumber(str) {
        return /^[\d\s\-\(\)\+]+$/.test(str) && str.length >= 10;
    },

    /**
     * Is valid credit card
     */
    isValidCreditCard(str) {
        const cleaned = str.replace(/\D/g, '');
        if (cleaned.length < 13 || cleaned.length > 19) return false;
        
        let sum = 0;
        for (let i = 0; i < cleaned.length; i++) {
            let digit = parseInt(cleaned[i]);
            if ((cleaned.length - i) % 2 === 0) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
        }
        
        return sum % 10 === 0;
    }
};

// ============================================
// OBJECT & UTILITY HELPERS
// ============================================

const ObjectUtils = {
    /**
     * Deep clone
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (obj instanceof Object) {
            const cloned = {};
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        }
    },

    /**
     * Merge objects
     */
    merge(target, ...sources) {
        return sources.reduce((result, source) => {
            Object.keys(source).forEach(key => {
                if (source[key] instanceof Object && key in result) {
                    result[key] = this.merge(result[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            });
            return result;
        }, target);
    },

    /**
     * Get nested value
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, prop) => current?.[prop], obj);
    },

    /**
     * Set nested value
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
        return obj;
    },

    /**
     * Invert object (swap keys and values)
     */
    invert(obj) {
        const inverted = {};
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                inverted[obj[key]] = key;
            }
        }
        return inverted;
    }
};

// ============================================
// EXPORT EXTENDED UTILITIES
// ============================================

window.ExtendedUtils = {
    MathUtils,
    StringUtils,
    DateUtils,
    ArrayUtils,
    StorageUtils,
    NumberUtils,
    ValidationUtils,
    ObjectUtils
};

console.log('✅ Extended Utilities Module Loaded');
