from slickk_server.tutor_engine import (
    model_response_is_low_quality,
    select_tutor_response,
)


BAD_PHOTOSYNTHESIS_RESPONSE = (
    '"Photosynthesis - A Process By Which Plants Make '
    'Glucose From Carbon Dioxide And Water."\n\n'
    "The first step was taken by the students as "
    "explained above. They did not know how much "
    "sunlight each plant needed. So we added some more "
    "information about what kind of sunlight these "
    "plants need. We also told them that there were two "
    "kinds of sunshine - direct solar rays and indirect "
    "ultraviolet radiation coming back down from the "
    "sky. Direct UV radiations could cause sunburn. "
    "Indirect Solar Radiation comes up again after the "
    "sun has gone down. The amount depends on latitude. "
    "(I am going to give the whole story"
)


def test_rejects_unbalanced_generated_answer():
    assert model_response_is_low_quality(
        (
            "Photosynthesis helps plants make glucose "
            "from carbon dioxide and water. "
            "(This explanation is unfinished"
        ),
        topic="Photosynthesis",
        teaching_mode="adaptive",
        language="english",
        grounding_text=(
            "Photosynthesis is the process by which "
            "plants use light energy to make glucose."
        ),
    )


def test_rejects_unsupported_photosynthesis_claims():
    assert model_response_is_low_quality(
        (
            "Photosynthesis uses indirect ultraviolet "
            "radiation that returns after sunset and "
            "changes according to latitude."
        ),
        topic="Photosynthesis",
        teaching_mode="adaptive",
        language="english",
        grounding_text=(
            "Plants use light energy, carbon dioxide "
            "and water to make glucose and oxygen."
        ),
    )


def test_bad_photosynthesis_answer_uses_verified_fallback():
    verified = (
        "Photosynthesis is the process by which green "
        "plants use light energy absorbed by chlorophyll "
        "to make glucose from carbon dioxide and water."
    )

    selected, rejected = select_tutor_response(
        BAD_PHOTOSYNTHESIS_RESPONSE,
        {
            "grounded": True,
            "grade": "Class 7",
            "topic": "Photosynthesis",
            "teaching_mode": "adaptive",
            "language": "english",
            "_verified_response": verified,
        },
    )

    assert rejected is True
    assert selected == verified
