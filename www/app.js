let count = 0;
const label = document.getElementById("count");
document.getElementById("btn").addEventListener("click", function () {
  count += 1;
  label.textContent = String(count);
});
