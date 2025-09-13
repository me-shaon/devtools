/**
 * DateDifference class
 * This class provides functionality to calculate the difference between two dates
 * and the difference between two times. It initializes the date difference calculator
 * and sets up event listeners for user interactions.
 * It calculates the difference in years, months, weeks, days, hours, minutes, and seconds.
 * @class
 * @author MsM Robin
 * @version 1.0.0
 * @date 2025-08-23
 */
class DateDifference {
  /**
   * Constructor for the DateDifference class.
   * Initializes the date difference calculator and sets up event listeners.
   * It binds the input fields and buttons to their respective DOM elements.
   * @constructor
   * @this {DateDifference}
   * @return {void}
   */
  constructor() {
    this.init();
  }

  init() {
    this.fromDateInput = document.getElementById('fromDate');
    this.toDateInput = document.getElementById('toDate');
    this.calculateButton = document.getElementById('calculate');
    this.resultDiv = document.getElementById('result');

    // Time Difference Dom
    this.time1Input = document.getElementById('time1');
    this.time2Input = document.getElementById('time2');
    this.calculateTimeButton = document.getElementById('timeCalculate');
    this.timeResultDiv = document.getElementById('timeResult');

    this.setupEventListeners();
  }

  /**
   * Sets up event listeners for the date difference calculator.
   * This method binds the click events for the calculate buttons to their respective functions.
   * It also initializes the time difference calculator with its own event listeners.
   * @return {void}
   */
  setupEventListeners() {
    this.calculateButton.addEventListener('click', () => {
      this.calculateDifference();
    });

    this.calculateTimeButton.addEventListener('click', () => {
      this.calculateTimeDifference();
    });
  }

  /**
   * Calculates the difference between two dates.
   * It retrieves the values from the input fields, converts them to Date objects,
   * and calculates the absolute difference in milliseconds.
   * The difference is then converted into years, months, weeks, and days.
   * The result is displayed in the resultDiv element.
   * @return {void}
   */
  calculateDifference() {
    const fromDate = new Date(this.fromDateInput.value);
    const toDate = new Date(this.toDateInput.value);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      this.resultDiv.textContent = 'Please enter valid dates.';
      return;
    }

    let diff = Math.abs(fromDate.getTime() - toDate.getTime());

    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
    diff -= years * (1000 * 60 * 60 * 24 * 365);

    const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
    diff -= months * (1000 * 60 * 60 * 24 * 30);

    const weeks = Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
    diff -= weeks * (1000 * 60 * 60 * 24 * 7);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    diff -= days * (1000 * 60 * 60 * 24);

    this.resultDiv.innerHTML = `
            <p>Years:</b> ${years}</p>
            <p>Months:</b> ${months}</p>
            <p>Weeks:</b> ${weeks}</p>
            <p>Days:</b> ${days}</p>
        `;
  }


  /**
   * Calculates the difference between two times.
   * It retrieves the values from the time input fields, splits them into hours, minutes,
   * and seconds, and converts them into Date objects.
   * @return {void}
   */
  calculateTimeDifference() {
    const time1 = this.time1Input.value.split(':').map(Number);
    const time2 = this.time2Input.value.split(':').map(Number);

    if (time1.length !== 2 || time2.length !== 2) {
      this.timeResultDiv.textContent = 'Please enter valid times in HH:MM:SS format.';
      return;
    }

    const date1 = new Date(0, 0, 0, ...time1);
    const date2 = new Date(0, 0, 0, ...time2);

    let diff = Math.abs(date1.getTime() - date2.getTime());

    const hours = Math.floor(diff / (1000 * 60 * 60));
    diff -= hours * (1000 * 60 * 60);

    const minutes = Math.floor(diff / (1000 * 60));
    diff -= minutes * (1000 * 60);

    const seconds = Math.floor(diff / 1000);

    this.timeResultDiv.innerHTML = `
            <p>Hours:</b> ${hours}</p>
            <p>Minutes:</b> ${minutes}</p>
            <p>Seconds:</b> ${seconds}</p>
        `;
  }
}

window.DateDifference = new DateDifference();