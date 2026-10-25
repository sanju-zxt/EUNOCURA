/**
 * A generic heart-healthy diet preview.
 *
 * This is the ONE fixture left in the frontend, and it is deliberately boring:
 * it is a textbook dietary pattern, not a patient record. `DietPlan.jsx` shows
 * it only when the patient has no clinician-authored plan on file (or the care
 * plan service cannot be reached), always behind the amber "Interactive preview
 * · fixture data" banner plus a sentence saying none of it is real patient data.
 *
 * It is never merged with a real plan and never labelled as one.
 */
export const previewDietPlan = {
  general: 'Heart-healthy diet recommended for managing cardiovascular risk factors.',
  recommended: [
    'Leafy green vegetables (spinach, kale, lettuce)',
    'Whole grains (brown rice, oats, quinoa)',
    'Fatty fish (salmon, mackerel, sardines) - 2-3 times per week',
    'Nuts and seeds (almonds, walnuts, chia seeds)',
    'Fresh fruits (berries, apples, citrus fruits)',
    'Legumes (lentils, chickpeas, beans)',
    'Low-fat dairy products',
    'Olive oil for cooking',
  ],
  avoid: [
    'Deep-fried foods',
    'Processed meats (sausages, bacon)',
    'High-sodium foods (pickles, papad, packaged snacks)',
    'Sugary beverages and desserts',
    'Trans fats and hydrogenated oils',
    'Excessive red meat',
    'Full-fat dairy products',
    'Refined carbohydrates (white bread, pasta)',
  ],
  tips: [
    'Limit salt intake to less than 5g per day',
    'Drink 8-10 glasses of water daily',
    'Eat smaller, more frequent meals',
    'Avoid heavy meals before bedtime',
    'Include fiber-rich foods in every meal',
  ],
};

export default previewDietPlan;
