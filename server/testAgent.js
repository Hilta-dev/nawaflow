//test agent part
const response = await fetch("http://localhost:3001/api/agent/parse", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    transcript:
      "Sold 3 bags of maize meal to Selma, she paid 200 and still owes 150, and I am nearly out of cooking oil.",
  }),
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));