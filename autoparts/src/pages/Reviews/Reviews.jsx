import { useState } from "react";
import { useParams } from "react-router-dom";

export default function Reviews() {
  const { productId } = useParams();
  const [reviews, setReviews] = useState([]);
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (text.trim() === "") return;
    setReviews([...reviews, text]);
    setText("");
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Reviews for Product #{productId}</h2>

      {/* Review input */}
      <textarea
        placeholder="Write your review..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          padding: "10px",
          marginTop: "1rem",
          borderRadius: "8px",
          border: "1px solid #ccc",
          fontSize: "1rem",
        }}
      />
      <br />
      <button
        onClick={handleSubmit}
        style={{
          marginTop: "1rem",
          padding: "10px 20px",
          backgroundColor: "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        Submit Review
      </button>

      {/* Review list */}
      <div style={{ marginTop: "2rem" }}>
        <h3>Submitted Reviews:</h3>
        {reviews.length === 0 ? (
          <p>No reviews yet. Be the first to write one!</p>
        ) : (
          <ul>
            {reviews.map((r, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
