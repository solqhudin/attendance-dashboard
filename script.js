const firebaseUrl = "https://meeting-attendance-project-default-rtdb.asia-southeast1.firebasedatabase.app/attendance.json";  
const sheetAPI = "https://script.google.com/macros/s/AKfycbyTPen0-Ihgr-gKofIrYsDRqAKdbmkR7iZ7KUMsL6fcKt17Cw_M0Fa1eJObHs9Gg1uSzA/exec";

const itemsPerPage = 5;
let currentPage = 1;
let allStudents = {};
let attendanceData = {};
let filteredLabels = [];
let filteredPercentages = [];
let filteredAttendanceCounts = [];
let selectedTopic = "all";
let totalParticipants = 0; // เก็บจำนวนคนที่เข้าร่วมประชุมในหัวข้อที่เลือก

// 🟢 โหลดข้อมูลจาก Firebase และ Google Sheet
Promise.all([
  fetch(sheetAPI).then(response => response.json()),
  fetch(firebaseUrl).then(response => response.json())
])
.then(([students, attendance]) => {
  allStudents = students;
  attendanceData = attendance;
  populateMeetingTopics(attendance);
  processData(selectedTopic, ""); // โหลดข้อมูลทั้งหมด
})
.catch(error => console.error("❌ เกิดข้อผิดพลาดในการดึงข้อมูล:", error));

// 🟢 สร้าง Dropdown สำหรับเลือกหัวข้อประชุม
function populateMeetingTopics(attendance) {
  let topics = new Set();
  Object.values(attendance).forEach(record => {
    topics.add(`${record.topic} (${record.meetingDate})`);
  });

  const dropdown = document.getElementById("meetingSelector");
  dropdown.innerHTML = ""; // เคลียร์ค่าก่อน

  let defaultOption = new Option("📋 แสดงทุกหัวข้อ", "all");
  dropdown.appendChild(defaultOption);

  topics.forEach(topic => {
    let option = new Option(`📌 ${topic}`, topic);
    dropdown.appendChild(option);
  });

  dropdown.addEventListener("change", () => {
    selectedTopic = dropdown.value;
    currentPage = 1; // รีเซ็ตไปที่หน้าแรกเมื่อเปลี่ยนหัวข้อประชุม
    processData(selectedTopic, document.getElementById("searchBox").value);
  });
}

// 🟢 ประมวลผลข้อมูลตามหัวข้อและตัวกรอง (❌ ไม่แสดงคนที่ไม่เคยเข้าประชุม)
function processData(selectedTopic, searchValue) {
  let attendanceCount = {};
  let totalMeetings = new Set();
  let uniqueParticipants = new Set(); // นับจำนวนผู้เข้าร่วมประชุมไม่ซ้ำกัน

  let filteredAttendanceData = Object.values(attendanceData).filter(record => {
    let topicKey = `${record.topic} (${record.meetingDate})`;
    let studentInfo = `${record.studentId} ${allStudents[record.studentId] || ""}`.toLowerCase();
    let topicMatch = selectedTopic === "all" || topicKey === selectedTopic;
    let searchMatch = searchValue === "" || studentInfo.includes(searchValue.toLowerCase());
    
    if (topicMatch && searchMatch) {
      totalMeetings.add(topicKey);
      uniqueParticipants.add(record.studentId);
      attendanceCount[record.studentId] = (attendanceCount[record.studentId] || 0) + 1;
    }
    return topicMatch && searchMatch;
  });

  totalParticipants = uniqueParticipants.size; // บันทึกจำนวนผู้เข้าร่วมประชุมในหัวข้อที่เลือก
  document.getElementById("totalParticipants").innerText = totalParticipants; // แสดงผลบนหน้าเว็บ

  let totalMeetingCount = selectedTopic === "all" ? totalMeetings.size : 1;
  document.getElementById("totalMeetings").innerText = totalMeetingCount;

  updateChart(attendanceCount, totalMeetingCount, searchValue);
}

// 🟢 อัปเดต Chart และแสดงเฉพาะคนที่เคยเข้าประชุม
function updateChart(attendanceCount, totalMeetings, searchValue) {
  filteredLabels = [];
  filteredPercentages = [];
  filteredAttendanceCounts = [];

  Object.keys(attendanceCount).forEach(studentId => { // ✅ แสดงเฉพาะคนที่เคยเข้าประชุม
    let attended = attendanceCount[studentId] || 0;
    let percent = totalMeetings > 0 ? (attended / totalMeetings * 100).toFixed(2) : "0.00";
    
    let studentName = allStudents[studentId] || "ไม่พบข้อมูล";
    let studentLabel = `${studentId} (${studentName})`;

    if (searchValue === "" || studentLabel.toLowerCase().includes(searchValue.toLowerCase())) {
      filteredLabels.push(studentLabel);
      filteredPercentages.push(percent);
      filteredAttendanceCounts.push(attended);
    }
  });

  currentPage = Math.min(currentPage, Math.ceil(filteredLabels.length / itemsPerPage)); // ปรับหน้าให้เหมาะสม
  updateChartDisplay();
}

// 🟢 แสดงผลกราฟตามหน้าที่เลือก
function updateChartDisplay() {
  let startIndex = (currentPage - 1) * itemsPerPage;
  let endIndex = startIndex + itemsPerPage;

  const ctx = document.getElementById('attendanceChart').getContext('2d');

  if (window.attendanceChart instanceof Chart) {
    window.attendanceChart.destroy();
  }

  window.attendanceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: filteredLabels.slice(startIndex, endIndex),
      datasets: [
        {
          label: 'เปอร์เซ็นต์การเข้าร่วมประชุม (%)',
          data: filteredPercentages.slice(startIndex, endIndex),
          backgroundColor: 'rgba(75, 192, 192, 0.6)'
        },
        {
          label: 'จำนวนครั้งที่เข้าประชุม',
          data: filteredAttendanceCounts.slice(startIndex, endIndex),
          backgroundColor: 'rgba(255, 99, 132, 0.6)'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });

  updatePagination();
}

// 🟢 Pagination - ปิดปุ่ม "ถัดไป" จนกว่าหน้าปัจจุบันจะเต็ม 10 คน
function updatePagination() {
  let totalPages = Math.ceil(filteredLabels.length / itemsPerPage);
  document.getElementById("currentPage").innerText = `หน้า ${currentPage}`;

  document.getElementById("prevPage").disabled = currentPage === 1;

  let currentDataLength = filteredLabels.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).length;
  document.getElementById("nextPage").disabled = currentDataLength < itemsPerPage || currentPage >= totalPages;
}

// 🟢 ฟังก์ชันเปลี่ยนหน้า
function changePage(step) {
  let totalPages = Math.ceil(filteredLabels.length / itemsPerPage);
  
  if ((step === 1 && currentPage < totalPages) || (step === -1 && currentPage > 1)) {
    currentPage += step;
    updateChartDisplay();
  }
}

// 🟢 ค้นหาอัตโนมัติเมื่อพิมพ์
document.getElementById("searchBox").addEventListener("input", () => {
  let searchValue = document.getElementById("searchBox").value;
  currentPage = 1;
  processData(selectedTopic, searchValue);
});

// 🟢 ปุ่มรีเซ็ตการค้นหา
function resetFilter() {
  document.getElementById("searchBox").value = "";
  currentPage = 1;
  processData(selectedTopic, "");
}
