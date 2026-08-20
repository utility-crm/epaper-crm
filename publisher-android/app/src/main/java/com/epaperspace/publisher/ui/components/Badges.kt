package com.epaperspace.publisher.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.MutedLight
import com.epaperspace.publisher.theme.PrimaryRed
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.theme.BorderStrongLight

enum class StatusType {
    DRAFT, PUBLISHED, ARCHIVED
}

@Composable
fun StatusBadge(status: StatusType, modifier: Modifier = Modifier) {
    val (bgColor, textColor, borderColor) = when (status) {
        StatusType.DRAFT -> Triple(Color(0x1AD90429), PrimaryRed, Color(0x4DD90429))
        StatusType.PUBLISHED -> Triple(Color(0x1E16A34A), SuccessGreen, Color(0x4D16A34A))
        StatusType.ARCHIVED -> Triple(MutedLight, MutedForegroundLight, BorderStrongLight)
    }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = bgColor,
        border = BorderStroke(1.dp, borderColor)
    ) {
        Text(
            text = status.name,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
            color = textColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp
        )
    }
}
